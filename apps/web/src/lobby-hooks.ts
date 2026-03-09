/**
 * 首页移动端增强功能
 */

import { useEffect, useCallback, useState } from 'react';
import { isMobileDevice, hapticFeedback } from './mobile-utils';

/**
 * 首页移动端增强 Hook
 */
export function useLobbyMobileEnhancements() {
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  // 检测虚拟键盘显示/隐藏
  useEffect(() => {
    if (!isMobileDevice()) return;

    const handleResize = () => {
      // 当窗口高度显著减小时，认为键盘弹出
      const viewportHeight = window.visualViewport?.height || window.innerHeight;
      const isKeyboard = viewportHeight < window.innerHeight * 0.75;
      setIsKeyboardVisible(isKeyboard);
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleResize);
      return () => window.visualViewport.removeEventListener('resize', handleResize);
    }
  }, []);

  // 增强的按钮点击（带触觉反馈）
  const enhancedButtonClick = useCallback((callback: () => void) => {
    return () => {
      if (isMobileDevice()) {
        hapticFeedback('medium');
      }
      callback();
    };
  }, []);

  // 增强的输入框聚焦（带触觉反馈）
  const enhancedInputFocus = useCallback(() => {
    if (isMobileDevice()) {
      hapticFeedback('light');
    }
  }, []);

  return {
    isKeyboardVisible,
    enhancedButtonClick,
    enhancedInputFocus,
    isMobile: isMobileDevice(),
  };
}

/**
 * 房间号输入格式化
 * 自动添加空格分隔，提升可读性
 */
export function formatRoomCode(value: string): string {
  // 移除所有非数字字符
  const digits = value.replace(/\D/g, '');

  // 限制为6位
  const limited = digits.slice(0, 6);

  // 每3位添加一个空格
  if (limited.length <= 3) {
    return limited;
  }
  return `${limited.slice(0, 3)} ${limited.slice(3)}`;
}

/**
 * 解析格式化的房间号
 */
export function parseRoomCode(formatted: string): string {
  return formatted.replace(/\s/g, '');
}

/**
 * 验证房间号
 */
export function validateRoomCode(code: string): { valid: boolean; message?: string } {
  const cleaned = parseRoomCode(code);

  if (cleaned.length === 0) {
    return { valid: false, message: '请输入房间号' };
  }

  if (cleaned.length < 6) {
    return { valid: false, message: '房间号必须是6位数字' };
  }

  if (!/^\d{6}$/.test(cleaned)) {
    return { valid: false, message: '房间号只能包含数字' };
  }

  return { valid: true };
}

/**
 * 验证昵称
 */
export function validateDisplayName(name: string): { valid: boolean; message?: string } {
  const trimmed = name.trim();

  if (trimmed.length === 0) {
    return { valid: false, message: '昵称不能为空' };
  }

  if (trimmed.length < 2) {
    return { valid: false, message: '昵称至少2个字符' };
  }

  if (trimmed.length > 12) {
    return { valid: false, message: '昵称最多12个字符' };
  }

  // 检查是否包含特殊字符（可选）
  if (!/^[\u4e00-\u9fa5a-zA-Z0-9_\s]+$/.test(trimmed)) {
    return { valid: false, message: '昵称只能包含中文、英文、数字和下划线' };
  }

  return { valid: true };
}

/**
 * 自动聚焦到第一个输入框（移动端友好）
 */
export function useAutoFocus(enabled: boolean = true) {
  useEffect(() => {
    if (!enabled || !isMobileDevice()) return;

    // 延迟聚焦，避免页面加载时立即弹出键盘
    const timer = setTimeout(() => {
      const firstInput = document.querySelector<HTMLInputElement>('input[type="text"], input[type="number"]');
      if (firstInput && document.activeElement !== firstInput) {
        // 不自动聚焦，避免移动端体验不佳
        // firstInput.focus();
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [enabled]);
}

/**
 * 输入框回车提交
 */
export function useEnterSubmit(callback: () => void) {
  return useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      callback();
    }
  }, [callback]);
}

/**
 * 防抖函数
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * 本地存储 Hook
 */
export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.warn(`Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  const setValue = useCallback((value: T) => {
    try {
      setStoredValue(value);
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn(`Error setting localStorage key "${key}":`, error);
    }
  }, [key]);

  return [storedValue, setValue];
}
