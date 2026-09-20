# Shinobi 3D

2D chibi ninja görselinden kabartma 3D figür üreten bir stüdyo. Figürü döndür, voxel / kabartma arasında geç, **GLB** (Blender, Unity, web) veya **STL** (3D baskı) olarak indir.

## Çalıştırma

Node 22+ gerekir.

```bash
npm install
npm run dev
```

Tarayıcıda `http://localhost:8080` açılır.

## Ne var

| | |
|---|---|
| Kabartma | Silüetten şişirilmiş, orijinal çizim dokulu 3D mesh |
| Voxel | Piksel heykel |
| Hacim | Derinlik kaydırıcısı |
| GLB / STL | Anlık dışa aktarma |

Hazır model: [`public/shinobi.glb`](public/shinobi.glb)

## Scriptler

```bash
python3 scripts/process-ninja.py      # şeffaf PNG + derinlik haritası
python3 scripts/export-ninja-mesh.py  # public/shinobi.glb
```

## Stack

React 19, TanStack Start, Three.js, Tailwind v4.

## Lisans

Kaynak senin. Görsel / 3D asset kullanım hakkı orijinal illüstrasyon sahibine aittir.
