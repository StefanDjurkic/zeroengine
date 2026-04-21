import json
import struct
import zlib
from pathlib import Path


OUTPUT_PATH = Path(__file__).resolve().parents[1] / "assets" / "models" / "bootstrap_cube.glb"


POSITIONS = [
    (-1.0, -1.0, 1.0),
    (1.0, -1.0, 1.0),
    (1.0, 1.0, 1.0),
    (-1.0, 1.0, 1.0),
    (1.0, -1.0, -1.0),
    (-1.0, -1.0, -1.0),
    (-1.0, 1.0, -1.0),
    (1.0, 1.0, -1.0),
    (-1.0, -1.0, -1.0),
    (-1.0, -1.0, 1.0),
    (-1.0, 1.0, 1.0),
    (-1.0, 1.0, -1.0),
    (1.0, -1.0, 1.0),
    (1.0, -1.0, -1.0),
    (1.0, 1.0, -1.0),
    (1.0, 1.0, 1.0),
    (-1.0, 1.0, 1.0),
    (1.0, 1.0, 1.0),
    (1.0, 1.0, -1.0),
    (-1.0, 1.0, -1.0),
    (-1.0, -1.0, -1.0),
    (1.0, -1.0, -1.0),
    (1.0, -1.0, 1.0),
    (-1.0, -1.0, 1.0),
]

NORMALS = [
    (0.0, 0.0, 1.0),
    (0.0, 0.0, 1.0),
    (0.0, 0.0, 1.0),
    (0.0, 0.0, 1.0),
    (0.0, 0.0, -1.0),
    (0.0, 0.0, -1.0),
    (0.0, 0.0, -1.0),
    (0.0, 0.0, -1.0),
    (-1.0, 0.0, 0.0),
    (-1.0, 0.0, 0.0),
    (-1.0, 0.0, 0.0),
    (-1.0, 0.0, 0.0),
    (1.0, 0.0, 0.0),
    (1.0, 0.0, 0.0),
    (1.0, 0.0, 0.0),
    (1.0, 0.0, 0.0),
    (0.0, 1.0, 0.0),
    (0.0, 1.0, 0.0),
    (0.0, 1.0, 0.0),
    (0.0, 1.0, 0.0),
    (0.0, -1.0, 0.0),
    (0.0, -1.0, 0.0),
    (0.0, -1.0, 0.0),
    (0.0, -1.0, 0.0),
]

UVS = [
    (0.0, 1.0),
    (1.0, 1.0),
    (1.0, 0.0),
    (0.0, 0.0),
    (0.0, 1.0),
    (1.0, 1.0),
    (1.0, 0.0),
    (0.0, 0.0),
    (0.0, 1.0),
    (1.0, 1.0),
    (1.0, 0.0),
    (0.0, 0.0),
    (0.0, 1.0),
    (1.0, 1.0),
    (1.0, 0.0),
    (0.0, 0.0),
    (0.0, 1.0),
    (1.0, 1.0),
    (1.0, 0.0),
    (0.0, 0.0),
    (0.0, 1.0),
    (1.0, 1.0),
    (1.0, 0.0),
    (0.0, 0.0),
]

INDICES = [
    0, 1, 2, 0, 2, 3,
    4, 5, 6, 4, 6, 7,
    8, 9, 10, 8, 10, 11,
    12, 13, 14, 12, 14, 15,
    16, 17, 18, 16, 18, 19,
    20, 21, 22, 20, 22, 23,
]

CHECKER_PIXELS = [
    (250, 214, 74, 255),
    (34, 192, 198, 255),
    (34, 192, 198, 255),
    (250, 112, 80, 255),
]


def pack_f32(values):
    return struct.pack("<{}f".format(len(values)), *values)


def pack_u16(values):
    return struct.pack("<{}H".format(len(values)), *values)


def pad4(blob, fill=b"\x00"):
    padding = (-len(blob)) % 4
    if padding:
        blob += fill * padding
    return blob


def png_chunk(chunk_type, data):
    crc = zlib.crc32(chunk_type)
    crc = zlib.crc32(data, crc) & 0xFFFFFFFF
    return struct.pack(
        ">I", len(data)
    ) + chunk_type + data + struct.pack(
        ">I", crc
    )


def make_png_rgba(width, height, pixels):
    rows = []
    for y in range(height):
        row = bytearray([0])
        for x in range(width):
            row.extend(pixels[y * width + x])
        rows.append(bytes(row))

    ihdr = struct.pack(
        ">IIBBBBB", width, height, 8, 6, 0, 0, 0
    )
    idat = zlib.compress(b"".join(rows), level=9)
    return b"".join(
        [
            b"\x89PNG\r\n\x1a\n",
            png_chunk(b"IHDR", ihdr),
            png_chunk(b"IDAT", idat),
            png_chunk(b"IEND", b""),
        ]
    )


def build_glb():
    position_blob = pad4(pack_f32([value for vertex in POSITIONS for value in vertex]))
    normal_blob = pad4(pack_f32([value for normal in NORMALS for value in normal]))
    uv_blob = pad4(pack_f32([value for uv in UVS for value in uv]))
    index_blob = pad4(pack_u16(INDICES))
    image_blob = pad4(make_png_rgba(2, 2, CHECKER_PIXELS))

    buffer_views = []
    binary_blob = bytearray()

    def append_view(data, target=None):
        offset = len(binary_blob)
        binary_blob.extend(data)
        view = {
            "buffer": 0,
            "byteOffset": offset,
            "byteLength": len(data),
        }
        if target is not None:
            view["target"] = target
        buffer_views.append(view)
        return len(buffer_views) - 1

    position_view = append_view(position_blob, 34962)
    normal_view = append_view(normal_blob, 34962)
    uv_view = append_view(uv_blob, 34962)
    index_view = append_view(index_blob, 34963)
    image_view = append_view(image_blob)

    document = {
        "asset": {"version": "2.0", "generator": "ZeroEngine Bootstrap GLB Generator"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0}],
        "samplers": [{"magFilter": 9729, "minFilter": 9729, "wrapS": 10497, "wrapT": 10497}],
        "images": [{"bufferView": image_view, "mimeType": "image/png"}],
        "textures": [{"sampler": 0, "source": 0}],
        "materials": [
            {
                "pbrMetallicRoughness": {
                    "baseColorTexture": {"index": 0},
                    "metallicFactor": 0.0,
                    "roughnessFactor": 0.85,
                }
            }
        ],
        "meshes": [
            {
                "name": "BootstrapCube",
                "primitives": [
                    {
                        "attributes": {
                            "POSITION": 0,
                            "NORMAL": 1,
                            "TEXCOORD_0": 2,
                        },
                        "indices": 3,
                        "material": 0,
                    }
                ],
            }
        ],
        "buffers": [{"byteLength": len(binary_blob)}],
        "bufferViews": buffer_views,
        "accessors": [
            {
                "bufferView": position_view,
                "componentType": 5126,
                "count": len(POSITIONS),
                "type": "VEC3",
                "min": [-1.0, -1.0, -1.0],
                "max": [1.0, 1.0, 1.0],
            },
            {
                "bufferView": normal_view,
                "componentType": 5126,
                "count": len(NORMALS),
                "type": "VEC3",
            },
            {
                "bufferView": uv_view,
                "componentType": 5126,
                "count": len(UVS),
                "type": "VEC2",
            },
            {
                "bufferView": index_view,
                "componentType": 5123,
                "count": len(INDICES),
                "type": "SCALAR",
                "min": [0],
                "max": [23],
            },
        ],
    }

    json_chunk = json.dumps(document, separators=(",", ":")).encode("utf-8")
    json_chunk = pad4(json_chunk, fill=b" ")
    bin_chunk = pad4(bytes(binary_blob))

    total_length = 12 + 8 + len(json_chunk) + 8 + len(bin_chunk)
    return b"".join(
        [
            b"glTF",
            struct.pack("<I", 2),
            struct.pack("<I", total_length),
            struct.pack("<I", len(json_chunk)),
            b"JSON",
            json_chunk,
            struct.pack("<I", len(bin_chunk)),
            b"BIN\x00",
            bin_chunk,
        ]
    )


def main():
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_bytes(build_glb())
    print(f"wrote {OUTPUT_PATH} ({OUTPUT_PATH.stat().st_size} bytes)")


if __name__ == "__main__":
    main()