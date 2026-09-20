# Shinobi 3D

2D karakter görselinden kabartma 3D figür. **İçe aktar** veya sürükle-bırak, figürü çevir, **GLB** / **STL** indir. İsteğe bağlı **Gerçek 3D · TRELLIS** Microsoft TRELLIS.2 ile hacimli mesh üretir.

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
| İçe aktar | PNG, JPG, WEBP, HEIC… — dosyadan seç veya sürükle-bırak |
| Kabartma | Silüetten şişirilmiş, anlık figür |
| Voxel | Piksel heykel |
| Gerçek 3D · TRELLIS | İçe aktarılan görseli TRELLIS.2 ile modelle (30–90 sn, Hugging Face Space) |
| GLB / STL | Anlık dışa aktarma |

Şeffaf PNG en iyi sonucu verir. TRELLIS butonu içe aktardıktan sonra açılır; kabartma sahnede kalır, bittiğinde GLB ile değişir.

Hazır örnek: [`public/shinobi.glb`](public/shinobi.glb)

## Scriptler

```bash
python3 scripts/process-ninja.py      # şeffaf PNG + derinlik haritası
python3 scripts/export-ninja-mesh.py  # public/shinobi.glb
```

## Stack

React 19, TanStack Start, Three.js, Tailwind v4. TRELLIS.2: Microsoft, MIT, Hugging Face Space.

## Lisans

Kaynak senin. Görsel / 3D asset kullanım hakkı orijinal illüstrasyon sahibine aittir.
