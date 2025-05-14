/**
 * 脚本仓库事件类型
 */
export enum ScriptRepositoryEventType {
  // 脚本操作相关事件
  SCRIPT_TOGGLE = 'script_toggle',
  SCRIPT_RUN = 'script_run',
  SCRIPT_STOP = 'script_stop',
  SCRIPT_SAVE = 'script_save',
  SCRIPT_DELETE = 'script_delete',
  SCRIPT_MOVE = 'script_move',
  SCRIPT_EDIT = 'script_edit',

  // 类型开关相关事件
  TYPE_TOGGLE = 'type_toggle',

  // 按钮相关事件
  BUTTON_ADD = 'button_add',
  BUTTON_REMOVE = 'button_remove',

  // 导入导出相关事件
  SCRIPT_IMPORT = 'script_import',
  SCRIPT_EXPORT = 'script_export',

  // 变量编辑相关事件
  VARIABLE_EDIT = 'variable_edit',

  // 界面相关事件
  UI_REFRESH = 'ui_refresh',
  UI_LOADED = 'ui_loaded',
}

/**
 * 事件监听器类型
 */
export type EventListener = (data: any) => void;

// 导入SillyTavern的事件源
import { eventSource } from '@sillytavern/script';

/**
 * 事件总线类，用于组件间通信
 * 基于SillyTavern.eventSource实现，但增加命名空间前缀避免冲突
 */
export class EventBus {
  private static instance: EventBus;
  private readonly EVENT_NAMESPACE = 'script_repository_';
  private activeListeners: Map<ScriptRepositoryEventType, Set<EventListener>> = new Map();

  private constructor() {}

  /**
   * 获取事件总线实例
   */
  public static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  /**
   * 获取带命名空间的事件名称
   * @param eventType 事件类型
   * @returns 带命名空间的事件名称
   */
  private getNamespacedEvent(eventType: ScriptRepositoryEventType): string {
    return `${this.EVENT_NAMESPACE}${eventType}`;
  }

  /**
   * 添加事件监听器
   * @param eventType 事件类型
   * @param listener 监听器函数
   */
  public on(eventType: ScriptRepositoryEventType, listener: EventListener): void {
    // 保存监听器引用，用于后续移除
    if (!this.activeListeners.has(eventType)) {
      this.activeListeners.set(eventType, new Set());
    }
    this.activeListeners.get(eventType)?.add(listener);

    // 使用SillyTavern的事件系统，但加上命名空间前缀
    const namespacedEvent = this.getNamespacedEvent(eventType);
    eventSource.on(namespacedEvent, listener);
  }

  /**
   * 移除事件监听器
   * @param eventType 事件类型
   * @param listener 监听器函数
   */
  public off(eventType: ScriptRepositoryEventType, listener: EventListener): void {
    const namespacedEvent = this.getNamespacedEvent(eventType);
    eventSource.removeListener(namespacedEvent, listener);

    // 从本地记录中移除
    const listeners = this.activeListeners.get(eventType);
    if (listeners) {
      listeners.delete(listener);
      if (listeners.size === 0) {
        this.activeListeners.delete(eventType);
      }
    }
  }

  /**
   * 触发事件
   * @param eventType 事件类型
   * @param data 事件数据
   */
  public emit(eventType: ScriptRepositoryEventType, data?: any): void {
    const namespacedEvent = this.getNamespacedEvent(eventType);
    eventSource.emit(namespacedEvent, data);
  }

  /**
   * 清空所有事件监听器
   */
  public clear(): void {
    // 移除所有已注册的监听器
    this.activeListeners.forEach((listeners, eventType) => {
      const namespacedEvent = this.getNamespacedEvent(eventType);
      listeners.forEach(listener => {
        eventSource.removeListener(namespacedEvent, listener);
      });
    });
    this.activeListeners.clear();
  }

  /**
   * 销毁事件总线实例
   */
  public static destroyInstance(): void {
    if (EventBus.instance) {
      EventBus.instance.clear();
      EventBus.instance = undefined as unknown as EventBus;
    }
  }
}

// 导出事件总线单例
export const scriptEvents = EventBus.getInstance();
