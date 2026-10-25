"""PCM.daily's Unity shirt viewer (Jview_v16.unity3d, Unity 2.5) -> the PCM
rider's kit mesh as JSON, and the kit textures it carries as PNG.

    python -I pcm-extract.py BUNDLE OUTDIR

Writes OUTDIR/pcm_cyclist.json for the SkinnedMeshRenderer whose mesh is
cyclist_jersey: positions (mesh space, bind pose, z up), UVs (v up, as Unity
stores them), triangles (the strip unrolled, degenerates dropped), each
vertex's four bone indices and weights, and per bone its name and the inverse
bind pose (bone -> mesh space, row-major 4x4). Also OUTDIR/pcm_default.png
(the 455x313 sunmaillot kit) and, for reference, the body mesh 'Cyclist' in
the same form under "body".
"""
import json
import sys

import UnityPy


def mat(m):
    return [[getattr(m, f'e{r}{c}') for c in range(4)] for r in range(4)]


def inverse(m):
    import numpy as np
    return np.linalg.inv(np.array(m)).tolist()


def triangles(mesh):
    ib = mesh.m_IndexBuffer
    idx = [ib[i] | ib[i + 1] << 8 for i in range(0, len(ib) - 1, 2)] if mesh.m_Use16BitIndices else ib
    out = []
    for sm in mesh.m_SubMeshes:
        first = sm.firstByte // 2
        run = idx[first:first + sm.indexCount]
        tris = []
        if sm.isTriStrip:
            for i in range(len(run) - 2):
                a, b, c = run[i], run[i + 1], run[i + 2]
                if a == b or b == c or a == c:
                    continue
                tris.append([a, c, b] if i % 2 else [a, b, c])
        else:
            tris = [run[i:i + 3] for i in range(0, len(run) - 2, 3)]
        out.append(tris)
    return out


def skinned(renderer):
    # Path ids repeat across the bundle's serialized files, so follow each
    # PPtr through its own file.
    mesh = renderer.m_Mesh.deref_parse_as_object()
    bones = []
    for p, bp in zip(renderer.m_Bones, mesh.m_BindPose):
        go = p.deref_parse_as_object().m_GameObject.deref_parse_as_object()
        bones.append({'name': go.m_Name, 'toMesh': inverse(mat(bp))})
    skin = [[[s.boneIndex_0_, s.boneIndex_1_, s.boneIndex_2_, s.boneIndex_3_],
             [s.weight_0_, s.weight_1_, s.weight_2_, s.weight_3_]] for s in mesh.m_Skin]
    return {
        'name': mesh.m_Name,
        'position': [[v.x, v.y, v.z] for v in mesh.m_Vertices],
        'uv': [[t.x, t.y] for t in mesh.m_UV],
        'submeshes': triangles(mesh),
        'boneIndex': [s[0] for s in skin],
        'boneWeight': [s[1] for s in skin],
        'bones': bones,
    }


def texture(t):
    """UnityPy has no Texture2D class for Unity 2.5, so decode the top mip of
    a DXT1/DXT5 texture here. Blocks pad the size to a multiple of 4, and
    rows run bottom-up."""
    import texture2ddecoder
    from PIL import Image
    w, h = t.m_Width, t.m_Height
    pw, ph = -(-w // 4) * 4, -(-h // 4) * 4
    fmt = {10: (texture2ddecoder.decode_bc1, 8), 12: (texture2ddecoder.decode_bc3, 16)}[t.m_TextureFormat]
    data = t.image_data[:pw * ph // 16 * fmt[1]]
    img = Image.frombytes('RGBA', (pw, ph), fmt[0](data, pw, ph), 'raw', 'BGRA')
    return img.crop((0, 0, w, h)).transpose(Image.FLIP_TOP_BOTTOM)


def main(bundle, outdir):
    env = UnityPy.load(bundle)
    meshes = {}
    for o in env.objects:
        if o.type.name == 'SkinnedMeshRenderer':
            r = o.read()
            m = skinned(r)
            meshes[m['name']] = m
        elif o.type.name == 'Texture2D':
            t = o.read()
            if t.m_Name.startswith('sunmaillot'):
                texture(t).save(f'{outdir}/pcm_default.png')
                print(f'pcm_default.png: {t.m_Name} {t.m_Width}x{t.m_Height}')
    out = dict(meshes['cyclist_jersey'])
    out['body'] = meshes.get('Cyclist')
    with open(f'{outdir}/pcm_cyclist.json', 'w') as f:
        json.dump(out, f)
    print(f"pcm_cyclist.json: {len(out['position'])} vertices,",
          '+'.join(str(len(s)) for s in out['submeshes']), 'triangles,', len(out['bones']), 'bones')


if __name__ == '__main__':
    main(*sys.argv[1:3])
