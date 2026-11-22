// 统一的「返回」行为：有历史记录就回退，否则回首页。
// 以前 Music / notify / shop / warehouse 各写了一遍同样的逻辑。
export function goBackOrHome(router) {
  if (window.history.length > 1) {
    router.back()
  } else {
    router.push('/')
  }
}
