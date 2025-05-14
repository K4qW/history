import { eventSource } from '@sillytavern/script';

import { VariableModel } from '@/component/variable_manager/model';
import { VariableType } from '@/component/variable_manager/types';
import { getVariables } from '@/function/variables';

let variableCache: Record<string, any> = {};

const VARIABLE_EVENTS: Record<string, string> = {
  GLOBAL: 'settings_updated',
  CHARACTER: 'character_variables_changed',
  MESSAGE: 'message_variables_changed',
  // 聊天变量不使用事件，而是使用轮询
  CHAT: '',
};

// 定义轮询间隔（毫秒）
const CHAT_POLLING_INTERVAL = 2000;

export interface IDomUpdater {
  addVariableCard(name: string, value: any): void;
  removeVariableCard(name: string): void;
  updateVariableCard(name: string, value: any): void;
  updateWithoutAnimation(isSkipAnimation: boolean): void;
}

interface ListenerStatus {
  bound: boolean;
  handler: (...args: any[]) => Promise<void>;
}

export class VariableSyncService {
  private domUpdater: IDomUpdater;
  private model: VariableModel;
  private currentType: VariableType | null = null;
  private _boundListeners: Record<VariableType, ListenerStatus> = {
    global: { bound: false, handler: this._handleVariableUpdate.bind(this, 'global') },
    character: { bound: false, handler: this._handleVariableUpdate.bind(this, 'character') },
    chat: { bound: false, handler: this._handleVariableUpdate.bind(this, 'chat') },
    message: { bound: false, handler: this._handleVariableUpdate.bind(this, 'message') },
  };
  // 用于聊天变量轮询的定时器ID
  private _chatPollingInterval: number | null = null;
  // 标记监听器是否处于激活状态
  private _listenersActive: boolean = false;
  // 标记是否正在进行类型切换
  private _isTypeChanging: boolean = false;
  // 记录最近处理的变量映射：键为变量名，值为处理时间戳
  private _recentlyProcessedVariables: Map<string, number> = new Map();
  // 上次清理记录时间
  private _lastCleanupTimestamp: number = 0;

  /**
   * 构造函数
   * @param domUpdater DOM更新器
   * @param model 变量数据模型
   */
  constructor(domUpdater: IDomUpdater, model: VariableModel) {
    this.domUpdater = domUpdater;
    this.model = model;
  }

  // 获取当前是否正在进行类型切换
  public get isTypeChanging(): boolean {
    return this._isTypeChanging;
  }

  /**
   * 将变量标记为最近处理过
   * @param name 变量名
   */
  public markVariableAsProcessed(name: string): void {
    this._recentlyProcessedVariables.set(name, Date.now());
  }

  /**
   * 检查变量是否最近被处理过
   * @param name 变量名
   * @param maxAgeMs 最长有效期(毫秒)，默认3000ms
   * @returns 变量是否最近被处理过
   */
  public wasRecentlyProcessed(name: string, maxAgeMs: number = 3000): boolean {
    const timestamp = this._recentlyProcessedVariables.get(name);
    if (!timestamp) return false;
    return Date.now() - timestamp < maxAgeMs;
  }

  /**
   * 清理过期的处理记录
   * @param maxAgeMs 记录最长有效期(毫秒)，默认5000ms
   * @private
   */
  private _cleanupProcessedRecords(maxAgeMs: number = 5000): void {
    const now = Date.now();
    // 每30秒最多进行一次清理操作
    if (now - this._lastCleanupTimestamp < 30000) return;

    this._lastCleanupTimestamp = now;
    this._recentlyProcessedVariables.forEach((timestamp, name) => {
      if (now - timestamp > maxAgeMs) {
        this._recentlyProcessedVariables.delete(name);
      }
    });
  }

  public async cleanup(): Promise<void> {
    this._unbindAllEventListeners();
    this._stopChatPolling();

    try {
      variableCache = {};
      this._recentlyProcessedVariables.clear();
    } catch (error) {
      console.error(`[VariableManager]：清空缓存时出错:`, error);
    }
    this.currentType = null;
  }

  /**
   * 设置当前变量类型，并相应地初始化监听器或轮询
   * @param type 变量类型
   * @returns 获取到的变量数据
   */
  public async setCurrentType(type: VariableType): Promise<Record<string, any>> {
    let loadedVariables = {};

    if (this.currentType !== type) {
      this._isTypeChanging = true;
      this.domUpdater.updateWithoutAnimation(true);

      this.currentType = type;

      loadedVariables = await this.initializeCacheForType(type);

      if (this._listenersActive) {
        if (type === 'chat') {
          this._startChatPolling();
        } else {
          this._bindVariableListener(type);
        }
      }

      this._isTypeChanging = false;
      this.domUpdater.updateWithoutAnimation(false);
    }

    return loadedVariables;
  }

  /**
   * 激活当前类型的事件监听器或轮询
   * 应在标签页激活时调用
   */
  public activateListeners(): void {
    this._listenersActive = true;
    if (this.currentType) {
      if (this.currentType === 'chat') {
        this._startChatPolling();
      } else {
        this._bindVariableListener(this.currentType);
      }
    }
  }

  /**
   * 停用当前的事件监听器或轮询
   * 应在标签页停用时调用，以节省性能
   */
  public deactivateListeners(): void {
    this._listenersActive = false;
    this._unbindAllEventListeners();
    this._stopChatPolling();
  }

  public async initializeCacheForType(type: VariableType): Promise<Record<string, any>> {
    try {
      const currentVariables = getVariables({ type });
      const fullCache = variableCache || {};
      fullCache[type] = _.cloneDeep(currentVariables);
      variableCache = fullCache;
      return currentVariables;
    } catch (error) {
      console.error(`[VariableManager]：初始化类型 ${type} 的缓存时出错:`, error);
      return {};
    }
  }

  /**
   * 手动触发变量更新处理，用于测试服务功能或在事件系统不可用时使用
   * @returns Promise<void>
   */
  public async manualUpdate(): Promise<void> {
    if (this.currentType) {
      await this._handleVariableUpdate(this.currentType);
    }
  }

  /**
   * 统一的变量监听器绑定方法
   * @param type 变量类型
   * @private
   */
  private _bindVariableListener(type: VariableType): void {
    if (type === 'chat') return;

    const eventName = VARIABLE_EVENTS[type.toUpperCase()];
    const listenerStatus = this._boundListeners[type];

    if (!listenerStatus.bound && eventName) {
      try {
        eventSource.on(eventName, listenerStatus.handler);
        this._boundListeners[type].bound = true;
      } catch (error) {
        console.error(`[VariableSyncService]：绑定${type}变量事件监听器时出错:`, error);
        this._boundListeners[type].bound = false;
      }
    }
  }

  /**
   * 解绑所有事件监听器
   * @private
   */
  private _unbindAllEventListeners(): void {
    for (const type of Object.keys(this._boundListeners) as VariableType[]) {
      if (type === 'chat') continue;

      const eventName = VARIABLE_EVENTS[type.toUpperCase()];
      const listenerStatus = this._boundListeners[type];

      if (listenerStatus.bound && eventName) {
        try {
          eventSource.removeListener(eventName, listenerStatus.handler);
          this._boundListeners[type].bound = false;
        } catch (error) {
          console.error(`[VariableManager]：解绑${type}变量事件监听器时出错:`, error);
        }
      }
    }
  }

  /**
   * 启动聊天变量的轮询
   * @private
   */
  private _startChatPolling(): void {
    this._stopChatPolling();

    if (this.currentType === 'chat' && this._listenersActive) {
      try {
        // 设置定时器定期检查聊天变量
        this._chatPollingInterval = window.setInterval(async () => {
          await this._handleVariableUpdate('chat');
        }, CHAT_POLLING_INTERVAL);
      } catch (error) {
        console.error('[VariableManager]：启动聊天变量轮询时出错:', error);
        this._chatPollingInterval = null;
      }
    }
  }

  /**
   * 停止聊天变量的轮询
   * @private
   */
  private _stopChatPolling(): void {
    if (this._chatPollingInterval !== null) {
      try {
        window.clearInterval(this._chatPollingInterval);
        this._chatPollingInterval = null;
      } catch (error) {
        console.error('[VariableManager]：停止聊天变量轮询时出错:', error);
      }
    }
  }

  /**
   * 统一的变量更新处理方法
   * 适用于所有变量类型（全局、角色、聊天、消息）
   * @param type 变量类型
   * @param data 可选的事件数据（角色变量事件会提供）
   * @private
   */
  private async _handleVariableUpdate(type: VariableType, data?: any): Promise<void> {
    // 如果当前类型不匹配或正在切换类型，或者是内部操作触发的更新，则忽略
    if (!this.currentType || this.currentType !== type || this._isTypeChanging || this.model.isInternalOperation()) {
      // 添加更详细的日志，特别是针对聊天变量轮询情况
      if (type === 'chat' && this.model.isInternalOperation()) {
        console.debug(`[VariableSyncService] 忽略聊天变量轮询更新：当前为内部操作`);
      }
      return;
    }

    try {
      // 如果是聊天变量轮询，触发清理过期记录
      if (type === 'chat') {
        this._cleanupProcessedRecords();
      }

      // 获取最新变量
      // 角色变量和消息变量事件会直接提供变量数据
      let currentVariables: Record<string, any>;
      if ((type === 'character' || type === 'message') && data && data.variables) {
        currentVariables = data.variables;
      } else {
        // 其他类型需要通过getVariables获取
        currentVariables = getVariables({ type });
      }

      const fullCache = variableCache || {};
      const cachedVariables = fullCache[type] || {};

      // 比较变量并更新DOM
      const { added, removed, updated } = this._compareVariableRecords(cachedVariables, currentVariables);

      // 针对聊天变量的特殊处理
      if (type === 'chat' && Object.keys(added).length > 0) {
        // 过滤掉已经在DOM中存在或最近处理过的变量
        const filteredAdded: Record<string, any> = {};

        for (const [name, value] of Object.entries(added)) {
          // 检查变量是否最近被处理过
          if (this.wasRecentlyProcessed(name)) {
            console.debug(`[VariableSyncService] 聊天变量轮询：变量"${name}"刚被处理过，跳过添加`);
            continue;
          }

          // 检查DOM中是否已存在此变量的卡片
          const existingCard = $(`.variable-card[data-name="${name}"]`);
          if (existingCard.length === 0) {
            filteredAdded[name] = value;
          } else {
            console.debug(`[VariableSyncService] 聊天变量轮询：变量"${name}"已存在于DOM中，跳过重复添加`);
          }
        }

        // 使用过滤后的添加列表
        Object.entries(filteredAdded).forEach(([name, value]) => {
          this.domUpdater.addVariableCard(name, value);
        });
      } else {
        // 其他变量类型正常处理
        // 处理变量添加
        Object.entries(added).forEach(([name, value]) => {
          this.domUpdater.addVariableCard(name, value);
        });
      }

      // 处理变量删除
      removed.forEach(name => {
        this.domUpdater.removeVariableCard(name);
      });

      // 处理变量更新，但对于聊天变量，跳过最近处理过的变量
      if (type === 'chat' && Object.keys(updated).length > 0) {
        Object.entries(updated).forEach(([name, value]) => {
          // 检查变量是否最近被处理过
          if (this.wasRecentlyProcessed(name)) {
            console.debug(`[VariableSyncService] 聊天变量轮询：变量"${name}"刚被处理过，跳过更新`);
            return;
          }

          this.domUpdater.updateVariableCard(name, value);
        });
      } else {
        // 其他变量类型正常处理更新
        Object.entries(updated).forEach(([name, value]) => {
          this.domUpdater.updateVariableCard(name, value);
        });
      }

      // 更新缓存
      fullCache[type] = _.cloneDeep(currentVariables);
      variableCache = fullCache;
    } catch (error) {
      console.error(`[VariableManager]：处理${type}变量更新时出错:`, error);
    }
  }

  /**
   * 比较缓存的变量记录和当前的变量记录。
   * @param cached - 缓存的变量记录 (Record<string, any>)
   * @param current - 当前的变量记录 (Record<string, any>)
   * @returns 包含已添加(Record)、已删除(string[])、已更新(Record)变量的对象
   */
  private _compareVariableRecords(
    cached: Record<string, any>,
    current: Record<string, any>,
  ): { added: Record<string, any>; removed: string[]; updated: Record<string, any> } {
    const added: Record<string, any> = {};
    const removed: string[] = [];
    const updated: Record<string, any> = {};

    const cachedKeys = new Set(Object.keys(cached));
    const currentKeys = new Set(Object.keys(current));

    // 检查已删除的变量
    for (const key of cachedKeys) {
      if (!currentKeys.has(key)) {
        removed.push(key);
      }
    }

    // 检查已添加或已更新的变量
    for (const key of currentKeys) {
      if (!cachedKeys.has(key)) {
        // 新增的变量
        if (this.currentType === 'chat') {
          // 对于聊天变量，检查是否最近处理过
          if (!this.wasRecentlyProcessed(key)) {
            // 检查DOM中是否存在（备用检查，避免边缘情况）
            const existingCard = $(`.variable-card[data-name="${key}"]`);
            if (existingCard.length === 0) {
              added[key] = _.cloneDeep(current[key]);
            }
          }
        } else {
          // 其他变量类型正常处理
          added[key] = _.cloneDeep(current[key]);
        }
      } else if (!_.isEqual(current[key], cached[key])) {
        // 处理变量更新
        if (this.currentType === 'chat') {
          // 对于聊天变量，仅当变量未被最近处理时才标记更新
          if (!this.wasRecentlyProcessed(key)) {
            updated[key] = _.cloneDeep(current[key]);
          }
        } else {
          // 其他变量类型正常处理
          updated[key] = _.cloneDeep(current[key]);
        }
      }
    }

    return { added, removed, updated };
  }
}
