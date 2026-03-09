/**
 * 移动端工具函数
 */

/**
 * 检测是否为移动设备
 */
export function isMobileDevice(): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

/**
 * 检测是否为触摸设备
 */
export function isTouchDevice(): boolean {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

/**
 * 获取屏幕方向
 */
export function getOrientation(): 'portrait' | 'landscape' {
  return window.innerHeight > window.innerWidth ? 'portrait' : 'landscape';
}

/**
 * 防止双击缩放
 */
export function preventDoubleTapZoom(element: HTMLElement): void {
  let lastTouchEnd = 0;
  element.addEventListener('touchend', (event) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) {
      event.preventDefault();
    }
    lastTouchEnd = now;
  }, { passive: false });
}

/**
 * 触觉反馈（如果设备支持）
 */
export function hapticFeedback(style: 'light' | 'medium' | 'heavy' = 'light'): void {
  if ('vibrate' in navigator) {
    const duration = style === 'light' ? 10 : style === 'medium' ? 20 : 30;
    navigator.vibrate(duration);
  }
}

/**
 * 请求全屏模式
 */
export function requestFullscreen(): void {
  const elem = document.documentElement;
  if (elem.requestFullscreen) {
    elem.requestFullscreen();
  } else if ((elem as any).webkitRequestFullscreen) {
    (elem as any).webkitRequestFullscreen();
  } else if ((elem as any).msRequestFullscreen) {
    (elem as any).msRequestFullscreen();
  }
}

/**
 * 退出全屏模式
 */
export function exitFullscreen(): void {
  if (document.exitFullscreen) {
    document.exitFullscreen();
  } else if ((document as any).webkitExitFullscreen) {
    (document as any).webkitExitFullscreen();
  } else if ((document as any).msExitFullscreen) {
    (document as any).msExitFullscreen();
  }
}

/**
 * 检测是否处于全屏模式
 */
export function isFullscreen(): boolean {
  return !!(
    document.fullscreenElement ||
    (document as any).webkitFullscreenElement ||
    (document as any).msFullscreenElement
  );
}

/**
 * 锁定屏幕方向（仅在支持的浏览器中）
 */
export async function lockOrientation(orientation: 'portrait' | 'landscape'): Promise<void> {
  try {
    if ('orientation' in screen && 'lock' in screen.orientation) {
      await screen.orientation.lock(orientation === 'portrait' ? 'portrait-primary' : 'landscape-primary');
    }
  } catch (error) {
    console.warn('Screen orientation lock not supported:', error);
  }
}

/**
 * 解锁屏幕方向
 */
export function unlockOrientation(): void {
  try {
    if ('orientation' in screen && 'unlock' in screen.orientation) {
      screen.orientation.unlock();
    }
  } catch (error) {
    console.warn('Screen orientation unlock not supported:', error);
  }
}

/**
 * 添加屏幕方向变化监听
 */
export function onOrientationChange(callback: (orientation: 'portrait' | 'landscape') => void): () => void {
  const handler = () => {
    callback(getOrientation());
  };

  window.addEventListener('resize', handler);
  window.addEventListener('orientationchange', handler);

  return () => {
    window.removeEventListener('resize', handler);
    window.removeEventListener('orientationchange', handler);
  };
}

/**
 * 获取安全区域内边距
 */
export function getSafeAreaInsets(): { top: number; right: number; bottom: number; left: number } {
  const style = getComputedStyle(document.documentElement);
  return {
    top: parseInt(style.getPropertyValue('env(safe-area-inset-top)') || '0'),
    right: parseInt(style.getPropertyValue('env(safe-area-inset-right)') || '0'),
    bottom: parseInt(style.getPropertyValue('env(safe-area-inset-bottom)') || '0'),
    left: parseInt(style.getPropertyValue('env(safe-area-inset-left)') || '0'),
  };
}

/**
 * 禁用页面滚动
 */
export function disableScroll(): void {
  document.body.style.overflow = 'hidden';
  document.body.style.position = 'fixed';
  document.body.style.width = '100%';
  document.body.style.height = '100%';
}

/**
 * 启用页面滚动
 */
export function enableScroll(): void {
  document.body.style.overflow = '';
  document.body.style.position = '';
  document.body.style.width = '';
  document.body.style.height = '';
}
