"""Trusted worker. The author provides only bounded scene data, never Python."""
import json
import math
import os
import sys
import bpy
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1:]
with open(args[0], encoding="utf8") as file:
    scene = json.load(file)
bpy.ops.wm.read_factory_settings(use_empty=True)
root = bpy.context.scene.collection
materials = {}
objects = {}

def assign(obj, name):
    obj.data.materials.append(materials[name])

def shade(obj):
    for polygon in obj.data.polygons:
        polygon.use_smooth = True

def bevel(obj, width, smooth=True):
    if not width:
        return
    modifier = obj.modifiers.new("Machined edge", "BEVEL")
    modifier.width, modifier.segments = width, 3
    if smooth:
        shade(obj)
        normals = obj.modifiers.new("Face normals", "WEIGHTED_NORMAL")
        normals.keep_sharp = True

for name, values in scene["materials"].items():
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    srgb = values["color"].lstrip("#")
    channels = [int(srgb[x:x+2], 16)/255 for x in (0, 2, 4)]
    linear = tuple(x/12.92 if x < .04045 else ((x+.055)/1.055)**2.4 for x in channels)
    shader.inputs["Base Color"].default_value = (*linear, 1)
    shader.inputs["Roughness"].default_value = values.get("roughness", .42)
    shader.inputs["Metallic"].default_value = values.get("metalness", 0)
    if values.get("emission"):
        shader.inputs["Emission Color"].default_value = (*linear, 1)
        shader.inputs["Emission Strength"].default_value = values["emission"]
    mat.diffuse_color = (*linear, 1)
    materials[name] = mat

for spec in scene["parts"]:
    typ = spec["kind"]
    position = spec.get("at", [0, 0, 0])
    if typ == "group":
        obj = bpy.data.objects.new(spec["id"], None)
        root.objects.link(obj)
    elif typ == "box":
        bpy.ops.mesh.primitive_cube_add(size=1)
        obj = bpy.context.object
        obj.dimensions = spec["size"]
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        bevel(obj, spec.get("bevel", 0), spec.get("smooth", True))
    elif typ == "cylinder":
        bpy.ops.mesh.primitive_cylinder_add(vertices=spec.get("segments", 40), radius=spec["radius"], depth=spec["height"])
        obj = bpy.context.object
        bevel(obj, spec.get("bevel", 0), spec.get("smooth", True))
    elif typ == "sphere":
        bpy.ops.mesh.primitive_uv_sphere_add(segments=spec.get("segments", 24), ring_count=12, radius=1)
        obj = bpy.context.object
        obj.scale = spec["size"]
        shade(obj)
    elif typ == "tube":
        curve = bpy.data.curves.new(spec["id"], "CURVE")
        curve.dimensions = "3D"
        curve.resolution_u = 4
        curve.bevel_depth = spec["radius"]
        curve.bevel_resolution = spec.get("detail", 2)
        curve.use_fill_caps = True
        if spec.get("smooth", False):
            spline = curve.splines.new("BEZIER")
            spline.bezier_points.add(len(spec["points"])-1)
            for pt, co in zip(spline.bezier_points, spec["points"]):
                pt.co = co
                pt.handle_left_type = pt.handle_right_type = "AUTO"
        else:
            spline = curve.splines.new("POLY")
            spline.points.add(len(spec["points"])-1)
            for pt, co in zip(spline.points, spec["points"]):
                pt.co = (*co, 1)
        spline.use_cyclic_u = spec.get("closed", False)
        obj = bpy.data.objects.new(spec["id"], curve)
        root.objects.link(obj)
    elif typ == "text":
        font = bpy.data.curves.new(spec["id"], "FONT")
        font.body = spec["text"]
        font.size = spec["height"]
        font.align_x = spec.get("align", "LEFT")
        font.align_y = "CENTER"
        obj = bpy.data.objects.new(spec["id"], font)
        root.objects.link(obj)
    elif typ == "mesh":
        mesh = bpy.data.meshes.new(spec["id"])
        mesh.from_pydata(spec["vertices"], [], spec["faces"])
        mesh.validate()
        mesh.update()
        obj = bpy.data.objects.new(spec["id"], mesh)
        root.objects.link(obj)
        bevel(obj, spec.get("bevel", 0), spec.get("smooth", True))
    obj.name = spec["id"]
    if spec.get("parent"):
        obj.parent = objects[spec["parent"]]
    obj.location = position
    obj.rotation_euler = [math.radians(v) for v in spec.get("rotation", [0, 0, 0])]
    if typ != "group":
        assign(obj, spec["material"])
    objects[spec["id"]] = obj

bpy.context.scene.unit_settings.system = 'METRIC'
bpy.context.scene.unit_settings.scale_length = scene["metersPerUnit"]
bpy.context.view_layer.update()
bounds = {}
for name, obj in objects.items():
    if obj.type == "EMPTY":
        continue
    points = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    bounds[name] = [[round(fn(p[axis] for p in points), 5) for axis in range(3)] for fn in (min, max)]

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(args[1], "scene.blend"), compress=True)
bpy.ops.export_scene.gltf(filepath=os.path.join(args[1], "scene.glb"), export_format="GLB",
    export_apply=True, export_texcoords=False, export_tangents=False,
    export_materials="EXPORT", export_animations=False, export_skins=False)
with open(os.path.join(args[1], "manifest.json"), "w", encoding="utf8") as file:
    json.dump({"blender": bpy.app.version_string, "bounds": bounds, "metersPerUnit": scene["metersPerUnit"]}, file)
