"""ace3d: the hero as a 3D model, pre-rendered to sprites.

The way the licensed GBA action games were made: build the character once in
3D, pose it, render every frame small, reduce to the palette. Here:

  1. the model is built from lofted parts in Blender (bpy), posed by our own
     kinematics (two-bone IK for arms and legs);
  2. each pose is rendered twice from a side-on orthographic camera, at 6x:
     a clay pass (lighting only) and an ID pass (which material, which body part);
  3. each sprite pixel takes the tone of its material's palette ramp that
     matches the light it received, so shading lands on clean ramps;
  4. the silhouette is inked, parts in front ink the parts behind;
  5. frames are written into the same .px sheets the rest of the pipeline reads.

    python3 studio/prerender/ace3d.py [--preview]
"""
import os, sys, math
import numpy as np
import bpy, bmesh
from mathutils import Vector, Matrix
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..', '..')
sys.path.insert(0, os.path.join(ROOT, 'studio'))
sys.path.insert(0, os.path.join(ROOT, 'art'))
TMP = os.environ.get('ACE3D_TMP', '/tmp/ace3d')
os.makedirs(TMP, exist_ok=True)

PPU = 25.0          # sprite pixels per model unit
SS = 6              # supersampling
TURN = math.radians(-22)   # three-quarter turn toward the camera

# ---------------------------------------------------------------- materials -> palette ramps (dark..light)
MATS = {
    'suit':  ['D', 'R', 'r', 'o'],
    'armor': ['d', 'G', 'g', 'w'],
    'skin':  ['S', 's', 's', 's'],
    'hair':  ['k', 'D', 'D', 'R'],
    'gold':  ['Y', 'Y', 'y', 'w'],
    'steel': ['k', 'd', 'G', 'g'],
    'dark':  ['k', 'k', 'd', 'G'],
    'hot':   ['R', 'r', 'o', 'w'],
    'cyan':  ['C', 'C', 'c', 'w'],
    'eye':   ['k', 'k', 'k', 'k'],
}
MAT_ID = {m: i + 1 for i, m in enumerate(MATS)}
CUTS = [0.30, 0.52, 0.80]          # light level -> ramp step
# body groups, back to front; a part in front inks the edge of the part behind it
GROUPS = ['farleg', 'fararm', 'pack', 'pelvis', 'torso', 'head', 'nearleg', 'gun', 'neararm']
GRP_ID = {g: i + 1 for i, g in enumerate(GROUPS)}
FAR = {'farleg': 0.62, 'fararm': 0.62}     # far limbs sit in shadow
UPPER = {'fararm', 'pack', 'torso', 'head', 'gun', 'neararm'}
LOWER = {'farleg', 'pelvis', 'nearleg'}


# ---------------------------------------------------------------- mesh building
def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)

OBJS = []           # (object, material, group, rest local matrix, joint name)

def _finish(bm, name, mat, grp, joint, smooth=True, subsurf=1):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = smooth
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    if subsurf:
        m = ob.modifiers.new('s', 'SUBSURF')
        m.levels = m.render_levels = subsurf
    OBJS.append(dict(ob=ob, mat=mat, grp=grp, joint=joint, local=Matrix.Identity(4)))
    return OBJS[-1]

def loft(name, rings, mat, grp, joint, n=14, local=None, subsurf=1):
    """rings: [(z, rx, ry, cx, cy)] along local Z, joined into a closed skin."""
    bm = bmesh.new()
    loops = []
    for r in rings:
        z, rx, ry = r[0], r[1], r[2]
        cx, cy = (r[3], r[4]) if len(r) > 3 else (0, 0)
        loops.append([bm.verts.new((cx + rx * math.cos(2 * math.pi * i / n), cy + ry * math.sin(2 * math.pi * i / n), z)) for i in range(n)])
    for a, b in zip(loops, loops[1:]):
        for i in range(n):
            bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
    bm.faces.new(list(reversed(loops[0])))
    bm.faces.new(loops[-1])
    o = _finish(bm, name, mat, grp, joint, subsurf=subsurf)
    if local is not None:
        o['local'] = local
    return o

def ball(name, r, mat, grp, joint, at=(0, 0, 0), scale=(1, 1, 1)):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=10, radius=r)
    o = _finish(bm, name, mat, grp, joint, subsurf=0)
    o['local'] = Matrix.Translation(at) @ Matrix.Diagonal((*scale, 1))
    return o

def box(name, size, mat, grp, joint, at=(0, 0, 0), bevel=0.012, rot=None):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    o = _finish(bm, name, mat, grp, joint, smooth=False, subsurf=0)
    if bevel:
        b = o['ob'].modifiers.new('b', 'BEVEL')
        b.width = bevel
        b.segments = 2
    o['local'] = Matrix.Translation(at) @ (rot or Matrix.Identity(4))
    return o

def tube(name, a, b, r0, r1, mat, grp, joint, n=12):
    """Straight tapered tube between two points in the joint's space."""
    a, b = Vector(a), Vector(b)
    L = (b - a).length
    return loft(name, [(0, r0, r0), (L, r1, r1)], mat, grp, joint, n=n, local=aim_matrix(a, b), subsurf=0)

def aim_matrix(a, b, hint=Vector((0, -1, 0))):
    """Matrix whose origin is a and whose +Z runs to b."""
    a, b = Vector(a), Vector(b)
    z = (b - a).normalized()
    x = hint - z * hint.dot(z)
    if x.length < 1e-4:
        x = Vector((1, 0, 0)) - z * z.x
    x.normalize()
    y = z.cross(x)
    m = Matrix((x, y, z)).transposed().to_4x4()
    m.translation = a
    return m


# ---------------------------------------------------------------- the model
# Units: 1 = 25 sprite pixels. Faces +X, near side is -Y, ground z = 0.
THIGH, SHIN, ANKLE = 0.37, 0.36, 0.085
HIP_Z, WAIST_Z = THIGH + SHIN + ANKLE, 0.86
SH_Z, SH_Y = 0.42, 0.215            # shoulder above the waist, half shoulder width
UARM, FARM = 0.25, 0.23
HEAD_Z, HELMET_R = 0.66, 0.185     # helmet centre above the waist
GUN_PIVOT = Vector((0.08, -0.15, 0.27))

def build():
    # --- pelvis and legs (limb parts are lofted along local Z from their joint)
    loft('pelvis', [(-0.11, 0.08, 0.11), (-0.05, 0.115, 0.165), (0.0, 0.11, 0.16), (0.03, 0.105, 0.15)], 'suit', 'pelvis', 'waist')
    for side, grp in ((-1, 'nearleg'), (1, 'farleg')):
        j = grp
        loft(j + '_thigh', [(-0.02, 0.095, 0.095), (0.08, 0.112, 0.105, 0.008, 0), (0.24, 0.096, 0.092), (THIGH, 0.08, 0.08)], 'suit', grp, j + '_hip')
        loft(j + '_kneepad', [(-0.05, 0.055, 0.07), (0.0, 0.088, 0.092, 0.022, 0), (0.055, 0.06, 0.075, 0.016, 0)], 'gold', grp, j + '_knee')
        loft(j + '_shin', [(0.0, 0.08, 0.08), (0.10, 0.086, 0.084, -0.008, 0), (0.17, 0.076, 0.076)], 'suit', grp, j + '_knee')
        # boot: cuff, shaft, then the foot is its own part hinged at the ankle
        loft(j + '_cuff', [(0.14, 0.10, 0.10), (0.19, 0.108, 0.108), (0.215, 0.09, 0.09)], 'armor', grp, j + '_knee', subsurf=0)
        loft(j + '_boot', [(0.20, 0.096, 0.096), (0.28, 0.092, 0.092), (SHIN + 0.02, 0.09, 0.09)], 'armor', grp, j + '_knee')
        loft(j + '_band', [(0.262, 0.097, 0.097), (0.30, 0.096, 0.096)], 'hot', grp, j + '_knee', subsurf=0)
        # foot: local X forward, Z up, origin at the ankle
        fm = Matrix.Rotation(math.radians(90), 4, 'Y')
        loft(j + '_foot', [(-0.10, 0.058, 0.078, 0.03, 0), (-0.03, 0.068, 0.088, 0.04, 0), (0.08, 0.064, 0.086, 0.045, 0), (0.18, 0.05, 0.076, 0.052, 0), (0.215, 0.028, 0.055, 0.06, 0)],
             'armor', grp, j + '_ankle', local=fm)
        box(j + '_sole', (0.33, 0.17, 0.035), 'dark', grp, j + '_ankle', at=(0.055, 0, -ANKLE + 0.017), bevel=0.01)

    # --- torso (joint 'chest': origin at the waist, Z up the spine)
    loft('belt', [(0.0, 0.118, 0.165), (0.04, 0.12, 0.168), (0.055, 0.108, 0.155)], 'gold', 'torso', 'chest', subsurf=0)
    ball('buckle', 0.03, 'armor', 'torso', 'chest', at=(0.105, -0.04, 0.03), scale=(0.6, 1, 1))
    loft('torso', [(0.03, 0.105, 0.15), (0.12, 0.112, 0.16, 0.005, 0), (0.24, 0.15, 0.205, 0.02, 0), (0.34, 0.155, 0.212, 0.022, 0),
                   (0.41, 0.12, 0.18, 0.01, 0), (0.45, 0.07, 0.09)], 'suit', 'torso', 'chest')
    loft('chestplate', [(0.21, 0.11, 0.14, 0.066, 0), (0.30, 0.125, 0.155, 0.07, 0), (0.39, 0.10, 0.13, 0.052, 0)], 'armor', 'torso', 'chest')
    ball('emblem', 0.035, 'gold', 'torso', 'chest', at=(0.19, -0.07, 0.30), scale=(0.5, 1.1, 1.1))
    loft('collar', [(0.43, 0.095, 0.105), (0.465, 0.105, 0.115), (0.49, 0.09, 0.10)], 'gold', 'torso', 'chest', subsurf=0)
    # backpack: frame, two tanks, nozzle
    box('pack', (0.13, 0.25, 0.30), 'armor', 'pack', 'chest', at=(-0.17, 0, 0.27), bevel=0.03)
    for y in (-0.07, 0.07):
        tube('tank%+d' % (y * 100), (-0.235, y, 0.15), (-0.235, y, 0.42), 0.05, 0.05, 'steel', 'pack', 'chest')
        ball('tankcap%+d' % (y * 100), 0.05, 'gold', 'pack', 'chest', at=(-0.235, y, 0.42))
    tube('nozzle', (-0.20, 0, 0.13), (-0.23, 0, 0.05), 0.035, 0.05, 'dark', 'pack', 'chest')
    box('packlight', (0.02, 0.06, 0.04), 'cyan', 'pack', 'chest', at=(-0.24, -0.126, 0.30), bevel=0)

    # --- head (joint 'head': origin at the helmet centre)
    ball('skull', 0.118, 'skin', 'head', 'head', at=(0.012, 0, -0.012), scale=(1.0, 0.92, 1.08))
    ball('hair', 0.126, 'hair', 'head', 'head', at=(-0.022, 0, 0.022), scale=(1.0, 0.95, 1.0))
    ball('fringe', 0.06, 'hair', 'head', 'head', at=(0.075, -0.02, 0.092), scale=(1.2, 1.3, 0.6))
    ball('nose', 0.026, 'skin', 'head', 'head', at=(0.128, 0, -0.03))
    ball('eye', 0.024, 'eye', 'head', 'head', at=(0.098, -0.062, 0.006))
    ball('ear', 0.028, 'skin', 'head', 'head', at=(-0.005, -0.112, -0.02))

    # --- arms: shoulder pad, upper arm, forearm, cuff, glove
    for grp in ('neararm', 'fararm'):
        ball(grp + '_pad', 0.108, 'armor', grp, grp + '_sh', at=(0, 0, 0.012), scale=(1.05, 1.0, 0.82))
        loft(grp + '_upper', [(0.0, 0.078, 0.078), (0.10, 0.084, 0.08), (UARM, 0.068, 0.068)], 'suit', grp, grp + '_sh')
        loft(grp + '_fore', [(0.0, 0.068, 0.068), (0.08, 0.074, 0.07), (FARM - 0.05, 0.062, 0.062)], 'suit', grp, grp + '_el')
        loft(grp + '_cuff', [(FARM - 0.075, 0.07, 0.07), (FARM - 0.03, 0.072, 0.072)], 'gold', grp, grp + '_el', subsurf=0)
        ball(grp + '_glove', 0.078, 'armor', grp, grp + '_el', at=(0, 0, FARM), scale=(1, 1, 1.15))

    # --- rifle (joint 'gun': origin at the pivot, +X down the barrel, +Z up)
    g = 'gun'
    box('stock', (0.17, 0.07, 0.12), 'gold', g, g, at=(-0.10, 0, -0.015), bevel=0.015)
    box('butt', (0.04, 0.078, 0.15), 'dark', g, g, at=(-0.20, 0, -0.015), bevel=0.01)
    box('receiver', (0.32, 0.10, 0.15), 'gold', g, g, at=(0.14, 0, 0.0), bevel=0.02)
    box('cell', (0.09, 0.112, 0.085), 'hot', g, g, at=(0.16, 0, -0.005), bevel=0.012)
    box('grip', (0.065, 0.06, 0.12), 'dark', g, g, at=(0.04, 0, -0.11), bevel=0.012, rot=Matrix.Rotation(math.radians(-14), 4, 'Y'))
    tube('scope', (0.04, 0, 0.118), (0.26, 0, 0.118), 0.042, 0.042, 'steel', g, g)
    tube('lens', (0.26, 0, 0.118), (0.275, 0, 0.118), 0.046, 0.046, 'cyan', g, g)
    tube('shroud', (0.30, 0, 0.0), (0.54, 0, 0.0), 0.07, 0.066, 'steel', g, g)
    for i in range(3):
        box('vent%d' % i, (0.03, 0.15, 0.06), 'dark', g, g, at=(0.355 + i * 0.065, 0, 0.0), bevel=0)
    box('foregrip', (0.11, 0.07, 0.07), 'dark', g, g, at=(0.41, 0, -0.085), bevel=0.012)
    tube('barrel', (0.54, 0, 0.0), (0.66, 0, 0.0), 0.045, 0.045, 'armor', g, g)
    tube('flare', (0.64, 0, 0.0), (0.74, 0, 0.0), 0.06, 0.092, 'hot', g, g)
    tube('tip', (0.74, 0, 0.0), (0.775, 0, 0.0), 0.075, 0.05, 'cyan', g, g)

GRIP, FORE, MUZZLE = Vector((0.04, 0, -0.13)), Vector((0.41, 0.0, -0.11)), Vector((0.78, 0, 0.0))


# ---------------------------------------------------------------- kinematics
def roty(deg):
    return Matrix.Rotation(math.radians(deg), 4, 'Y')

def ik2(a, b, l1, l2, pole):
    """Middle joint of a two-bone chain from a to b, bent toward pole."""
    d = b - a
    L = min(d.length, l1 + l2 - 1e-4)
    if d.length > L:
        b = a + d.normalized() * L
        d = b - a
    u = d.normalized()
    x = (l1 * l1 - l2 * l2 + L * L) / (2 * L)
    hgt = math.sqrt(max(0.0, l1 * l1 - x * x))
    p = pole - u * pole.dot(u)
    p = p.normalized() if p.length > 1e-5 else Vector((0, 0, -1))
    return a + u * x + p * hgt, b

def pose(legs=((8, 10, 0), (-8, 6, 0)), lean=3, aim=0, recoil=0.0, crouch=0.0, spin=0.0, curl=0.0, head=0,
         lift=None, arms=None):
    """-> {joint: world matrix}, plus named points. Angles in degrees.
    legs: (thigh swing forward, knee bend, foot pitch) for near and far leg.
    lean: spine forward. aim: rifle elevation. curl: extra spine curl for the tuck.
    spin: whole body turn about the camera axis around its middle (somersault)."""
    J = {}
    # legs hang from the hips; the pelvis height is whatever plants the lower foot
    feet = []
    for (th, kn, ft), y in zip(legs, (-0.085, 0.085)):
        hip = Vector((0, y, 0))
        kd = roty(-th) @ Vector((0, 0, -1))
        knee = hip + kd * THIGH
        sd = roty(-(th - kn)) @ Vector((0, 0, -1))
        ankle = knee + sd * SHIN
        low = ankle.z - ANKLE - max(0.0, math.sin(math.radians(abs(ft)))) * 0.12
        feet.append((hip, knee, ankle, ft, low))
    hip_z = -min(f[4] for f in feet) if lift is None else lift
    W = Vector((0, 0, hip_z + (WAIST_Z - HIP_Z)))                 # waist joint
    for name, (hip, knee, ankle, ft, low) in zip(('nearleg', 'farleg'), feet):
        off = Vector((0, 0, hip_z))
        J[name + '_hip'] = aim_matrix(hip + off, knee + off, Vector((1, 0, 0)))
        J[name + '_knee'] = aim_matrix(knee + off, ankle + off, Vector((1, 0, 0)))
        J[name + '_ankle'] = Matrix.Translation(ankle + off) @ roty(-ft)
    J['waist'] = Matrix.Translation(W)
    C = Matrix.Translation(W) @ roty(lean + curl)
    J['chest'] = C
    J['head'] = C @ Matrix.Translation((0.02, 0, HEAD_Z)) @ roty(head + curl * 0.6)
    up = max(0.0, math.sin(math.radians(aim)))
    G = C @ Matrix.Translation(GUN_PIVOT + Vector((0.12 * up, -0.03 * up, 0.06 * up))) @ roty(-aim) @ Matrix.Translation((-recoil, 0, 0))
    J['gun'] = G
    for name, y, tgt, pole in (('neararm', -SH_Y, GRIP, Vector((-0.6, -0.5, -1))), ('fararm', SH_Y, FORE, Vector((0.2, 0.6, -1)))):
        sh = C @ Vector((0.0, y, SH_Z))
        hand = (G @ tgt) if arms is None else (C @ Vector(arms[name]))
        el, hand = ik2(sh, hand, UARM, FARM, C.to_3x3() @ pole)
        J[name + '_sh'] = aim_matrix(sh, el, Vector((1, 0, 0)))
        J[name + '_el'] = aim_matrix(el, hand, Vector((1, 0, 0)))
    pts = dict(waist=W.copy(), muzzle=G @ MUZZLE, helmet=J['head'].translation.copy(), ground=Vector((0, 0, 0)),
               centre=W + Vector((0, 0, 0.12)))
    R = Matrix.Rotation(TURN, 4, 'Z')
    if spin:
        c = pts['centre']
        R = Matrix.Translation(c) @ roty(spin) @ Matrix.Translation(-c) @ R
    J = {k: R @ m for k, m in J.items()}
    pts = {k: R @ v for k, v in pts.items()}
    return J, pts

def apply(J):
    for o in OBJS:
        o['ob'].matrix_world = J[o['joint']] @ o['local']


# ---------------------------------------------------------------- rendering
def setup_scene():
    s = bpy.context.scene
    s.render.engine = 'CYCLES'
    s.cycles.device = 'CPU'
    s.render.film_transparent = True
    s.view_settings.view_transform = 'Standard'
    s.render.image_settings.file_format = 'PNG'
    s.render.image_settings.color_mode = 'RGBA'
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    cam.data.type = 'ORTHO'
    s.collection.objects.link(cam)
    s.camera = cam
    cam.rotation_euler = (math.radians(90), 0, 0)             # looks along +Y: screen x = world X, up = Z
    def sun(name, rot, strength):
        l = bpy.data.objects.new(name, bpy.data.lights.new(name, 'SUN'))
        l.data.energy = strength
        l.data.angle = math.radians(30)
        l.rotation_euler = [math.radians(v) for v in rot]
        s.collection.objects.link(l)
        return l
    lights = [sun('key', (52, 0, 38), 3.4), sun('fill', (75, 0, -60), 0.55), sun('rim', (120, 0, 150), 1.2)]
    w = bpy.data.worlds.new('w')
    s.world = w
    w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[1].default_value = 0.32
    clay = bpy.data.materials.new('clay')
    clay.use_nodes = True
    b = clay.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (0.8, 0.8, 0.8, 1)
    b.inputs['Roughness'].default_value = 0.55
    # ID materials: R = material, G = group (emission, read back exactly)
    for o in OBJS:
        key = f"id_{o['mat']}_{o['grp']}"
        m = bpy.data.materials.get(key)
        if not m:
            m = bpy.data.materials.new(key)
            m.use_nodes = True
            nt = m.node_tree
            nt.nodes.clear()
            e = nt.nodes.new('ShaderNodeEmission')
            out = nt.nodes.new('ShaderNodeOutputMaterial')
            e.inputs[0].default_value = (MAT_ID[o['mat']] * 16 / 255.0, GRP_ID[o['grp']] * 16 / 255.0, 0, 1)
            nt.links.new(e.outputs[0], out.inputs[0])
        o['idmat'] = m
        o['ob'].data.materials.append(m)
    return cam, clay, lights

def shot(cam, clay, lights, visible, w, h, px0, py0, tag):
    """Render the visible groups into a w x h sprite window whose top-left pixel
    corner is at sprite coordinates (px0, py0) where sprite x = X*PPU, y = -Z*PPU.
    -> (light level, material id, group id) arrays at sprite resolution."""
    s = bpy.context.scene
    for o in OBJS:
        o['ob'].hide_render = o['grp'] not in visible
    s.render.resolution_x, s.render.resolution_y = w * SS, h * SS
    cam.data.ortho_scale = max(w, h) / PPU
    cam.location = ((px0 + w / 2) / PPU, -10, -(py0 + h / 2) / PPU)
    out = []
    for kind in ('clay', 'id'):
        s.view_layers[0].material_override = clay if kind == 'clay' else None
        s.view_settings.view_transform = 'Standard' if kind == 'clay' else 'Raw'
        s.cycles.samples = 40 if kind == 'clay' else 1
        s.cycles.filter_width = 1.5 if kind == 'clay' else 0.01
        for l in lights:
            l.hide_render = kind == 'id'
        s.render.filepath = os.path.join(TMP, f'{tag}_{kind}.png')
        bpy.ops.render.render(write_still=True)
        out.append(np.array(Image.open(s.render.filepath).convert('RGBA')).astype(np.float32))
    clay_a, id_a = out
    H, Wd = h, w
    blk = lambda a: a.reshape(H, SS, Wd, SS, -1).transpose(0, 2, 1, 3, 4).reshape(H, Wd, SS * SS, -1)
    cb, ib = blk(clay_a), blk(id_a)
    mat = np.rint(ib[..., 0] / 16).astype(int)
    grp = np.rint(ib[..., 1] / 16).astype(int)
    clean = (ib[..., 3] > 250) & (np.abs(ib[..., 0] - mat * 16) < 3) & (np.abs(ib[..., 1] - grp * 16) < 3) & \
            (mat >= 1) & (mat <= len(MATS)) & (grp >= 1) & (grp <= len(GROUPS))       # drop blended edge samples
    mat, grp = mat * clean, grp * clean
    code = mat * 32 + grp                                           # majority vote per sprite pixel
    M = np.zeros((H, Wd), int); G = np.zeros((H, Wd), int); L = np.zeros((H, Wd), np.float32)
    for y in range(H):
        for x in range(Wd):
            c = code[y, x]
            cov = (c > 0).sum()
            if cov < SS * SS * 0.42:
                continue
            vals, cnt = np.unique(c[c > 0], return_counts=True)
            win = vals[cnt.argmax()]
            M[y, x], G[y, x] = win // 32, win % 32
            sel = c == win
            L[y, x] = cb[y, x][sel][:, :3].mean() / 255.0
    return L, M, G


def to_keys(L, M, G, helmet=None, ink=True):
    """Light + material + group -> palette keys, with inking."""
    names = list(MATS)
    gname = [None] + GROUPS
    H, W = M.shape
    out = [['.'] * W for _ in range(H)]
    for y in range(H):
        for x in range(W):
            if not M[y, x]:
                continue
            ramp = MATS[names[M[y, x] - 1]]
            lv = L[y, x] * FAR.get(gname[G[y, x]], 1.0)
            out[y][x] = ramp[sum(lv > c for c in CUTS)]
    # a part in front inks the edge of the part behind it (with that part's darkest tone)
    for y in range(H):
        for x in range(W):
            if not M[y, x]:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < W and 0 <= ny < H and G[ny, nx] > G[y, x] and not (gname[G[y, x]] == 'pelvis' and gname[G[ny, nx]] == 'nearleg'):
                    ramp = MATS[names[M[y, x] - 1]]
                    out[y][x] = 'k' if ramp[0] in ('k', 'Y', 'S', 'C') else ramp[0]
                    break
    if helmet:                                                      # the glass bubble is painted over the head
        cx, cy, r = helmet
        for y in range(H):
            for x in range(W):
                d = math.hypot(x + 0.5 - cx, y + 0.5 - cy)
                if d > r:
                    continue
                if out[y][x] == '.' or G[y, x] < GRP_ID['head']:
                    back = (x + 0.5 - cx) < -r * 0.15
                    out[y][x] = 'C' if (back and (y + 0.5 - cy) > -r * 0.2) else 'c'
                if d > r - 1.5 and (x + 0.5 - cx) < -r * 0.25 and (y + 0.5 - cy) < -r * 0.25 and G[y, x] <= GRP_ID['head']:
                    out[y][x] = 'w'
    if ink:
        op = np.array([[c != '.' for c in r] for r in out])
        pad = np.pad(op, 1)
        ring = (pad[1:-1, 2:] | pad[1:-1, :-2] | pad[2:, 1:-1] | pad[:-2, 1:-1]) & ~op
        for y, x in zip(*np.nonzero(ring)):
            out[y][x] = 'k'
    return [''.join(r) for r in out]


def sprite(cam, clay, lights, J, pts, groups, w, h, anchor, at, tag, ink=True):
    """Render a posed frame so that 3D point `at` lands on the sprite's anchor pixel."""
    apply(J)
    bpy.context.view_layer.update()
    ax = round(at.x * PPU) if isinstance(at, Vector) else at[0]
    ay = round(-at.z * PPU) if isinstance(at, Vector) else at[1]
    px0, py0 = ax - anchor[0], ay - anchor[1]
    L, M, G = shot(cam, clay, lights, groups, w, h, px0, py0, tag)
    hel = None
    if 'head' in groups:
        hc = pts['helmet']
        hel = (hc.x * PPU - px0, -hc.z * PPU - py0, HELMET_R * PPU)
    rows = to_keys(L, M, G, hel, ink)
    proj = lambda v: (int(math.floor(v.x * PPU - px0)), int(math.floor(-v.z * PPU - py0)))
    return rows, proj
