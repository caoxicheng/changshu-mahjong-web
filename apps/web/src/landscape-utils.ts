/**
 * 强制横屏工具函数
 * 尝试使用 Screen Orientation API 锁定横屏
 */

export function lockLandscape() {
  // 检查是否支持 Screen Orientation API
  if (screen.orientation && screen.orientation.lock) {
    // 尝试锁定横屏（仅在全屏模式下有效）
    screen.orientation
      .lock("landscape")
      .then(() => {
        console.log("屏幕已锁定为横屏模式");
      })
      .catch((error) => {
        console.log("无法锁定屏幕方向（可能需要全屏模式）:", error.message);
      });
  }
}

/**
 * 请求全屏并锁定横屏
 */
export function requestFullscreenLandscape() {
  const element = document.documentElement;

  // 请求全屏
  const requestFullscreen =
    element.requestFullscreen ||
    (element as any).webkitRequestFullscreen ||
    (element as any).mozRequestFullScreen ||
    (element as any).msRequestFullscreen;

  if (requestFullscreen) {
    requestFullscreen
      .call(element)
      .then(() => {
        console.log("已进入全屏模式");
        // 全屏后尝试锁定横屏
        lockLandscape();
      })
      .catch((error: Error) => {
        console.log("无法进入全屏模式:", error.message);
      });
  }
}

/**
 * 监听屏幕方向变化
 */
export function watchOrientation(callback: (isLandscape: boolean) => void) {
  const checkOrientation = () => {
    const isLandscape = window.matchMedia("(orientation: landscape)").matches;
    callback(isLandscape);
  };

  // 初始检查
  checkOrientation();

  // 监听方向变化
  window.addEventListener("orientationchange", checkOrientation);
  window.addEventListener("resize", checkOrientation);

  // 返回清理函数
  return () => {
    window.removeEventListener("orientationchange", checkOrientation);
    window.removeEventListener("resize", checkOrientation);
  };
}
