# Shinobi 3D

2D karakter görselinden kabartma 3D figür. **İçe aktar** veya sürükle-bırak, figürü çevir, **GLB** / **STL** indir.

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
| Kabartma | Silüetten şişirilmiş, orijinal çizim dokulu mesh |
| Voxel | Piksel heykel |
| Hacim | Derinlik kaydırıcısı |
| GLB / STL | Anlık dışa aktarma |

Şeffaf PNG en iyi sonucu verir. Beyaz / dama tahtası arka plan otomatik temizlenir.

Hazır örnek: [`public/shinobi.glb`](public/shinobi.glb)

## Scriptler

```bash
python3 scripts/process-ninja.py      # şeffaf PNG + derinlik haritası
python3 scripts/export-ninja-mesh.py  # public/shinobi.glb
```

## Stack

React 19, TanStack Start, Three.js, Tailwind v4.

## Lisans

Kaynak senin. Görsel / 3D asset kullanım hakkı orijinal illüstrasyon sahibine aittir.
