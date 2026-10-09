// 头像压缩：本地存的是 200×200 PNG 的 data URL（动辄上百 KB），
// 而狼人杀座位上只显示 38px —— 把原图随快照下发会把联机直接打爆。
// 这里统一按短边居中裁成正方形后缩到 96×96 的 JPEG（约 3~6KB），够 2 倍屏显示。
export const AVATAR_SIZE = 96
export const AVATAR_QUALITY = 0.8

// 返回压缩后的 data URL；任何异常（空图 / 解码失败 / 非图片）都返回 ''，绝不让它抛出去影响开局
export function shrinkAvatar(dataUrl, size = AVATAR_SIZE, quality = AVATAR_QUALITY) {
  return new Promise((resolve) => {
    if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
      resolve('')
      return
    }
    try {
      const img = new Image()
      img.onload = () => {
        try {
          const w = img.naturalWidth || size
          const h = img.naturalHeight || size
          // 短边居中裁正方形，避免非正方形原图被拉变形
          const side = Math.min(w, h)
          const sx = (w - side) / 2
          const sy = (h - side) / 2
          const canvas = document.createElement('canvas')
          canvas.width = size
          canvas.height = size
          const ctx = canvas.getContext('2d')
          if (!ctx) { resolve(''); return }
          ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size)
          const out = canvas.toDataURL('image/jpeg', quality)
          // 极端情况下 JPEG 编码可能失败（返回 data:,）—— 那种就当没有头像
          resolve(out && out.startsWith('data:image/') ? out : '')
        } catch (e) {
          resolve('')
        }
      }
      img.onerror = () => resolve('')
      img.src = dataUrl
    } catch (e) {
      resolve('')
    }
  })
}
