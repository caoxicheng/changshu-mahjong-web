/**
 * 移动端增强 Hook
 * 在 RoomPage 组件中使用，添加移动端特定功能
 */

import { useEffect, useCallback } from 'react';
import {
  isMobileDevice,
  isTouchDevice,
  hapticFeedback,
  disableScroll,
  enableScroll,
  preventDoubleTapZoom,
  onOrientationChange,
} from './mobile-utils';

/**
 * 移动端游戏页面增强 Hook
 */
export function useMobileEnhancements(isInGame: boolean) {
  // 禁用页面滚动（游戏中）
  useEffect(() => {
    if (isInGame && isMobileDevice()) {
      disableScroll();
      return () => enableScroll();
    }
  }, [isInGame]);

  // 防止双击缩放
  useEffect(() => {
    if (isTouchDevice()) {
      const root = document.getElementById('root');
      if (root) {
        preventDoubleTapZoom(root);
      }
    }
  }, []);

  // 屏幕方向变化提示
  useEffect(() => {
    if (!isMobileDevice()) return;

    const cleanup = onOrientationChange((orientation) => {
      console.log('Screen orientation changed to:', orientation);
      // 可以在这里添加方向变化的提示或处理逻辑
    });

    return cleanup;
  }, []);

  // 触觉反馈函数
  const vibrate = useCallback((style: 'light' | 'medium' | 'heavy' = 'light') => {
    if (isMobileDevice()) {
      hapticFeedback(style);
    }
  }, []);

  return {
    vibrate,
    isMobile: isMobileDevice(),
    isTouch: isTouchDevice(),
  };
}

/**
 * 增强的出牌处理函数
 * 添加触觉反馈
 */
export function useEnhancedDiscardTile(
  originalDiscardTile: (tileId: string) => void,
  vibrate: (style: 'light' | 'medium' | 'heavy') => void
) {
  return useCallback(
    (tileId: string) => {
      vibrate('light');
      originalDiscardTile(tileId);
    },
    [originalDiscardTile, vibrate]
  );
}

/**
 * 增强的游戏操作处理函数
 * 添加触觉反馈
 */
export function useEnhancedGameAction(
  originalGameAction: (action: string) => void,
  vibrate: (style: 'light' | 'medium' | 'heavy') => void
) {
  return useCallback(
    (action: string) => {
      // 胡牌使用重反馈，其他操作使用中等反馈
      vibrate(action === 'hu' ? 'heavy' : 'medium');
      originalGameAction(action);
    },
    [originalGameAction, vibrate]
  );
}
