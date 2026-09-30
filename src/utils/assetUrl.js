// 资源路径适配：把以 "/" 开头的 public 路径转成「相对页面基准」的 URL。
export function toRuntimeUrl(p) {
  if (!p) return p
  if (/^[a-z][a-z0-9+.-]*:/i.test(p)) return p
  return new URL(p.replace(/^\/+/, ''), document.baseURI).href
}
