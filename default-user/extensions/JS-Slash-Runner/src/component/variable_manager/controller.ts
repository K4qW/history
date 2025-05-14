import { VariableModel } from '@/component/variable_manager/model';
import { VariableSyncService } from '@/component/variable_manager/sync';
import { VariableDataType, VariableType } from '@/component/variable_manager/types';
import { VariableView } from '@/component/variable_manager/view';

export class VariableController {
  /**
   * 变量数据模型
   */
  private model: VariableModel;

  /**
   * 变量视图
   */
  private view: VariableView;

  /**
   * 变量同步服务
   */
  private syncService: VariableSyncService;

  /**
   * 构造函数
   * @param model 数据模型
   * @param view 视图
   * @param syncService 同步服务
   */
  constructor(model: VariableModel, view: VariableView, syncService: VariableSyncService) {
    this.model = model;
    this.view = view;
    this.syncService = syncService;
  }

  /**
   * 初始化控制器
   * @param container UI容器
   */
  public async init(container: JQuery<HTMLElement>): Promise<void> {
    this.view.initUI();
    this.bindEvents(container);

    try {
      // 确保预加载变量时也使用内部操作标记
      this.model.beginInternalOperation();
      const preloadedVariables = await this.syncService.setCurrentType('global');
      this.syncService.activateListeners();
      await this.loadVariables('global', preloadedVariables);
    } finally {
      this.model.endInternalOperation();
    }
  }

  /**
   * 绑定UI事件
   * @param container UI容器
   */
  private bindEvents(container: JQuery<HTMLElement>): void {
    container.find('.tab-item').on('click', this.handleTabChange.bind(this));
    container.on('click', '.add-list-item', this.handleAddListItem.bind(this));
    container.on('click', '.list-item-delete', this.handleDeleteListItem.bind(this));
    container.on('click', '.delete-btn', this.handleDeleteVariableCard.bind(this));
    container.on('click', '.save-btn', this.handleSaveVariableCard.bind(this));
    container.on('click', '#add-variable', this.handleAddVariable.bind(this));
    container.on('click', '#clear-all', this.handleClearAll.bind(this));
    container.on('click', '#filter-icon', this.handleFilterIconClick.bind(this));
    container.on('change', '.filter-checkbox', this.handleFilterOptionChange.bind(this));
    container.on('input', '#variable-search', this.handleVariableSearch.bind(this));
    container.on('click', '#floor-filter-btn', this.handleFloorRangeFilter.bind(this));
  }

  /**
   * 加载变量
   * @param type 变量类型
   * @param preloadedVariables 预加载的变量数据
   */
  public async loadVariables(type: VariableType, preloadedVariables?: Record<string, any>): Promise<void> {
    // 如果正在加载，忽略重复请求
    if (this.model.isLoading) {
      console.log(`[VariableController] 忽略重复的${type}变量加载请求`);
      return;
    }

    const isListeningActive = this.syncService['_listenersActive'];
    if (isListeningActive) {
      this.syncService.deactivateListeners();
    }

    try {
      this.model.beginInternalOperation();

      // 加载变量数据
      const loadSuccess = await this.model.loadVariables(type, preloadedVariables);

      if (!loadSuccess) {
        console.warn(`[VariableController] ${type}变量加载未完成或被取消`);
        return;
      }

      // 更新UI相关配置
      if (type === 'message') {
        this.view.getContainer().find('#floor-filter-container').show();
        const [minFloor, maxFloor] = this.model.getFloorRange();
        this.view.updateFloorRangeInputs(minFloor, maxFloor);
      } else {
        this.view.getContainer().find('#floor-filter-container').hide();
      }

      // 刷新变量卡片显示
      this.refreshVariableCards();
    } finally {
      this.model.endInternalOperation();

      if (isListeningActive) {
        this.syncService.activateListeners();
      }
    }
  }

  /**
   * 强制刷新当前活动变量
   */
  public forceRefresh(): void {
    try {
      this.model.beginInternalOperation();
      this.model.forceRefreshVariables();
      this.refreshVariableCards();
    } catch (error) {
      console.error(`[VariableManager] 强制刷新变量数据失败:`, error);
    } finally {
      this.model.endInternalOperation();
    }
  }

  /**
   * 刷新变量卡片
   */
  private refreshVariableCards(): void {
    const type = this.model.getActiveVariableType();

    try {
      const filteredVariables = this.model.filterVariables();
      this.view.refreshVariableCards(type, filteredVariables);
    } catch (error) {
      console.error(`[VariableManager] 刷新变量卡片失败:`, error);
    }
  }

  /**
   * 处理标签页切换
   * @param event 点击事件
   */
  private async handleTabChange(event: JQuery.ClickEvent): Promise<void> {
    const target = $(event.currentTarget);
    const tabId = target.attr('id');

    if (!tabId) return;

    const type = tabId.replace('-tab', '') as VariableType;
    const currentType = this.model.getActiveVariableType();

    if (type === currentType) return;

    // 先更新UI标签状态
    this.view.setActiveTab(type);

    // 停用当前监听器
    this.syncService.deactivateListeners();

    // 设置新的变量类型，并获取预加载的变量
    const preloadedVariables = await this.syncService.setCurrentType(type);

    // 加载新类型的变量（使用预加载的变量避免重复获取）
    await this.loadVariables(type, preloadedVariables);

    // 激活新类型的监听器
    this.syncService.activateListeners();
  }

  /**
   * 处理添加列表项
   * @param event 点击事件
   */
  private handleAddListItem(event: JQuery.ClickEvent): void {
    const button = $(event.currentTarget);
    const listContainer = button.siblings('.list-items-container');

    const newItem = $(`
      <div class="list-item">
        <span class="drag-handle">☰</span>
        <textarea class="variable-content-input" placeholder="输入变量内容"></textarea>
        <button class="list-item-delete"><i class="fa-solid fa-times"></i></button>
      </div>
    `);

    listContainer.append(newItem);
    newItem.find('textarea').focus();
  }

  /**
   * 处理删除列表项
   * @param event 点击事件
   */
  private handleDeleteListItem(event: JQuery.ClickEvent): void {
    const button = $(event.currentTarget);
    const listItem = button.closest('.list-item');

    // 添加删除动画效果
    listItem.css({
      'background-color': 'rgba(255, 0, 0, 0.2)',
      transition: 'all 0.3s ease',
    });

    // 应用转换效果
    setTimeout(() => {
      listItem.css({
        transform: 'scale(0.9)',
        opacity: '0.7',
      });

      // 淡出效果完成后移除元素
      setTimeout(() => {
        listItem.remove();
      }, 200);
    }, 50);
  }

  /**
   * 处理删除变量卡片
   * @param event 点击事件
   */
  private handleDeleteVariableCard(event: JQuery.ClickEvent): void {
    const button = $(event.currentTarget);
    const card = button.closest('.variable-card');
    const name = this.view.getVariableCardName(card);
    const type = this.model.getActiveVariableType();

    // 获取楼层信息（如果在楼层面板内）
    let floorId: number | undefined = undefined;
    if (type === 'message') {
      const floorPanel = card.closest('.floor-panel');
      if (floorPanel.length > 0) {
        floorId = parseInt(floorPanel.attr('data-floor') || '', 10);
        if (isNaN(floorId)) {
          floorId = undefined;
        }
      }
    }

    this.view.showConfirmDialog(`确定要删除变量 "${name}" 吗？`, async confirmed => {
      if (confirmed) {
        try {
          this.model.beginInternalOperation();
          await this.model.deleteVariableData(type, name, floorId);

          // 不再直接处理DOM操作，而是通过removeVariableCard方法
          this.view.removeVariableCard(name);
        } catch (error) {
          console.error(`[VariableManager] 删除变量失败:`, error);
        } finally {
          this.model.endInternalOperation();
        }
      }
    });
  }

  /**
   * 处理添加变量
   */
  private async handleAddVariable(): Promise<void> {
    const type = this.model.getActiveVariableType();

    this.view.showAddVariableDialog((dataType, floorId) => {
      try {
        this.model.beginInternalOperation();
        // 传递floorId参数到createNewVariableCard
        this.view.createNewVariableCard(type, dataType, floorId);
      } finally {
        this.model.endInternalOperation();
      }
    });
  }

  /**
   * 处理保存变量卡片
   * @param event 点击事件
   */
  private async handleSaveVariableCard(event: JQuery.ClickEvent): Promise<void> {
    const button = $(event.currentTarget);
    const card = button.closest('.variable-card');
    const oldName = card.attr('data-original-name') || '';
    const newName = this.view.getVariableCardName(card);
    const type = this.model.getActiveVariableType();
    const value = this.view.getVariableCardValue(card);
    const isNewCard = card.attr('data-status') === 'new';

    // 获取楼层ID (用于message类型)
    const floorId = type === 'message' ? parseInt(card.attr('data-floor') || '-1', 10) : undefined;

    if (!newName || newName.trim() === '') {
      toastr.error('变量名不能为空');
      return;
    }

    try {
      this.model.beginInternalOperation();

      if (isNewCard) {
        // 对于新卡片，只检查新名称是否与已有变量重名
        if (this.model.getVariableValue(newName) !== undefined) {
          toastr.error(`变量名 "${newName}" 已存在，请使用其他名称`);
          return;
        }

        // 保存新变量 (根据类型决定是否传递message_id)
        if (type === 'message' && floorId !== undefined && floorId >= 0) {
          await this.model.saveVariableData(type, newName, value, floorId);
        } else {
          await this.model.saveVariableData(type, newName, value);
        }

        // 更新卡片状态
        card.removeAttr('data-status');
        card.attr('data-original-name', newName);
        card.attr('data-name', newName);

        // 使用动画效果替代吐司通知
        card.addClass('variable-added');
        setTimeout(() => {
          card.removeClass('variable-added');
        }, 1500);

        // 对于聊天变量，将其添加到最近处理记录中，防止轮询重复处理
        if (type === 'chat') {
          this.syncService.markVariableAsProcessed(newName);
        }
      } else if (oldName !== newName) {
        // 变量重命名
        if (this.model.getVariableValue(newName) !== undefined) {
          toastr.error(`变量名 "${newName}" 已存在，请使用其他名称`);
          return;
        }

        // 重命名变量
        await this.model.renameVariable(type, oldName, newName, value);

        // 更新卡片属性
        card.attr('data-original-name', newName);
        card.attr('data-name', newName);

        // 使用动画效果替代吐司通知
        card.addClass('variable-changed');
        setTimeout(() => {
          card.removeClass('variable-changed');
        }, 1500);

        // 对于聊天变量，将其添加到最近处理记录中
        if (type === 'chat') {
          // 移除旧名称的记录(如果存在)，添加新名称的记录
          this.syncService.markVariableAsProcessed(newName);
        }
      } else {
        // 仅更新值
        await this.model.saveVariableData(type, newName, value);

        // 使用动画效果替代吐司通知
        card.addClass('variable-changed');
        setTimeout(() => {
          card.removeClass('variable-changed');
        }, 1500);

        // 对于聊天变量，将其添加到最近处理记录中
        if (type === 'chat') {
          this.syncService.markVariableAsProcessed(newName);
        }
      }

      // 确保在卡片动画完成后再结束内部操作标记，特别是对于聊天变量
      // 这将给轮询更多时间识别为内部操作，避免重复添加卡片
      if (type === 'chat') {
        setTimeout(() => {
          this.model.endInternalOperation();
        }, 2100); // 稍长于动画时间和轮询间隔
      } else {
        this.model.endInternalOperation();
      }
    } catch (error: any) {
      console.error(`[VariableManager] 保存变量失败:`, error);
      toastr.error(`保存变量时出错: ${error.message || '未知错误'}`);
      this.model.endInternalOperation();
    }
  }

  /**
   * 处理清除所有变量
   */
  private async handleClearAll(): Promise<void> {
    const type = this.model.getActiveVariableType();

    this.view.showConfirmDialog(
      `确定要清除所有${this.getVariableTypeName(type)}变量吗？此操作不可撤销。`,
      async confirmed => {
        if (confirmed) {
          try {
            this.model.beginInternalOperation();
            await this.model.clearAllVariables(type);

            // 获取容器
            const container = this.view.getContainer().find(`#${type}-content .variables-container`);
            const floorContainer = this.view.getContainer().find(`#${type}-content .floor-variables-container`);

            // 先添加淡出效果
            container.css({
              transition: 'all 0.5s ease',
              opacity: '0.2',
            });
            floorContainer.css({
              transition: 'all 0.5s ease',
              opacity: '0.2',
            });

            // 动画完成后使用刷新机制更新UI，而不是直接清空DOM
            setTimeout(() => {
              // 使用现有的刷新机制，确保UI和数据一致
              this.refreshVariableCards();

              // 恢复容器透明度
              container.css({ opacity: '1' });
              floorContainer.css({ opacity: '1' });

              // 保留成功通知，因为这是全局操作
              toastr.success(`已清除所有${this.getVariableTypeName(type)}变量`);
            }, 500);
          } catch (error: any) {
            console.error(`[VariableManager] 清除${type}变量失败:`, error);
            toastr.error(`清除${this.getVariableTypeName(type)}变量时出错: ${error.message || '未知错误'}`);
          } finally {
            this.model.endInternalOperation();
          }
        }
      },
    );
  }

  /**
   * 处理筛选图标点击
   */
  private handleFilterIconClick(): void {
    const $filterOptions = this.view.getContainer().find('.filter-options');
    $filterOptions.toggle();
  }

  /**
   * 处理筛选选项变更
   * @param event 变更事件
   */
  private handleFilterOptionChange(event: JQuery.ChangeEvent): void {
    const $checkbox = $(event.currentTarget);
    const type = $checkbox.data('type') as VariableDataType;
    const isChecked = $checkbox.is(':checked');

    this.model.updateFilterState(type, isChecked);
    this.refreshVariableCards();
  }

  /**
   * 处理变量搜索
   * @param event 输入事件
   */
  private handleVariableSearch(event: JQuery.TriggeredEvent): void {
    const keyword = $(event.currentTarget).val() as string;
    this.model.updateSearchKeyword(keyword);
    this.refreshVariableCards();
  }

  /**
   * 处理楼层范围筛选
   */
  private handleFloorRangeFilter(): void {
    const $minInput = this.view.getContainer().find('#floor-min');
    const $maxInput = this.view.getContainer().find('#floor-max');

    const minVal = $minInput.val() as string;
    const maxVal = $maxInput.val() as string;

    const min = minVal ? parseInt(minVal) : null;
    const max = maxVal ? parseInt(maxVal) : null;

    if ((min !== null && isNaN(min)) || (max !== null && isNaN(max))) {
      this.view.showFloorFilterError('请输入有效的数字');
      return;
    }

    if (min !== null && max !== null && min > max) {
      this.view.showFloorFilterError('最小值不能大于最大值');
      return;
    }

    this.view.hideFloorFilterError();

    if (min !== null || max !== null) {
      this.applyFloorRangeAndReload(min || 0, max === null ? Infinity : max);
    }
  }

  /**
   * 应用楼层范围并重新加载变量
   * @param min 最小楼层
   * @param max 最大楼层
   */
  private async applyFloorRangeAndReload(min: number, max: number): Promise<void> {
    try {
      this.model.beginInternalOperation();

      // 更新模型中的楼层范围
      this.model.updateFloorRange(min, max);

      // 更新输入框显示值
      this.view.updateFloorRangeInputs(min, max);

      // 重新加载消息变量
      await this.loadVariables('message');
    } catch (error: any) {
      console.error(`[VariableManager] 应用楼层范围并重新加载变量失败:`, error);
    } finally {
      this.model.endInternalOperation();
    }
  }

  /**
   * 清理资源
   */
  public cleanup(): void {
    try {
      this.model.resetInternalOperationState();

      this.syncService.cleanup();
    } catch (error) {
      console.error(`[VariableManager] 清理资源失败:`, error);
    }
  }

  /**
   * 获取变量类型的中文名称
   * @param type 变量类型
   * @returns 中文名称
   */
  private getVariableTypeName(type: VariableType): string {
    switch (type) {
      case 'global':
        return '全局';
      case 'character':
        return '角色';
      case 'chat':
        return '聊天';
      case 'message':
        return '消息';
      default:
        return type;
    }
  }
}
