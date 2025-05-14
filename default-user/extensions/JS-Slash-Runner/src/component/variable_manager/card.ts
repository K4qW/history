import { getSortableDelay } from '@sillytavern/scripts/utils';
import { VariableDataType } from '@/component/variable_manager/types';

export class VariableCardFactory {
  /**
   * 从值推断变量数据类型
   * @param value 要推断类型的值
   * @returns 推断出的变量数据类型
   */
  public inferDataType(value: any): VariableDataType {
    if (Array.isArray(value)) {
      return 'array';
    } else if (typeof value === 'boolean') {
      return 'boolean';
    } else if (typeof value === 'number') {
      return 'number';
    } else if (typeof value === 'object' && value !== null) {
      return 'object';
    }
    return 'string';
  }

  /**
   * 设置变量卡片的数据属性
   * @param card 变量卡片jQuery对象
   * @param name 变量名称
   * @param value 变量值
   * @returns 设置了属性的变量卡片jQuery对象
   */
  public setCardDataAttributes(card: JQuery<HTMLElement>, name: string, value: any): JQuery<HTMLElement> {
    card.attr('data-name', name);
    card.attr('data-original-name', name);
    card.attr('data-value', JSON.stringify(value));
    return card;
  }

  /**
   * 创建变量卡片
   * @param type 变量数据类型
   * @param name 变量名称
   * @param value 变量值
   * @returns 变量卡片jQuery对象
   */
  public createCard(type: VariableDataType, name: string, value: any): JQuery<HTMLElement> {
    let card: JQuery<HTMLElement>;
    switch (type) {
      case 'array':
        card = this.createArrayCard(name, value as any[]);
        break;
      case 'boolean':
        card = this.createBooleanCard(name, value as boolean);
        break;
      case 'number':
        card = this.createNumberCard(name, value as number);
        break;
      case 'object':
        card = this.createObjectCard(name, value as object);
        break;
      case 'string':
        card = this.createStringCard(name, String(value));
        break;
      default:
        // 默认返回字符串变量卡片（包括处理null和undefined值）
        card = this.createStringCard(name, String(value));
    }

    // 设置数据属性
    return this.setCardDataAttributes(card, name, value);
  }

  /**
   * 创建数组变量卡片
   * @param name 变量名称
   * @param items 数组项
   * @returns 数组变量卡片jQuery对象
   */
  private createArrayCard(name: string, items: any[]): JQuery<HTMLElement> {
    const card = $(`
      <div class="variable-card" data-type="array" data-name="${name}">
        <div class="variable-card-header">
          <div class="variable-title-container">
            <i class="fa-solid fa-list"></i>
            <input type="text" class="variable-title" value="${name}" placeholder="变量名称">
          </div>
          <div class="variable-actions">
            <button class="variable-action-btn save-btn" title="保存">
              <i class="fa-regular fa-save"></i>
            </button>
            <button class="variable-action-btn delete-btn" title="删除">
              <i class="fa-regular fa-trash-can"></i>
            </button>
          </div>
        </div>
        <div class="variable-card-content">
          <div class="list-items-container">
            ${this.generateArrayItems(items)}
          </div>
          <button class="add-list-item"><i class="fa-solid fa-plus"></i> 添加项目</button>
        </div>
      </div>
    `);

    // 为列表添加拖拽功能
    const listContainer = card.find('.list-items-container');
    listContainer.sortable({
      delay: getSortableDelay(),
      handle: '.drag-handle',
      // 此处只记录排序事件，实际保存由保存按钮触发
    });

    return card;
  }

  /**
   * 生成数组项HTML
   * @param items 数组项
   * @returns 数组项HTML字符串
   */
  private generateArrayItems(items: any[]): string {
    if (!items || items.length === 0) {
      return '';
    }

    return items
      .map(
        item => `
      <div class="list-item">
        <span class="drag-handle">☰</span>
        <textarea class="variable-content-input">${String(item)}</textarea>
        <button class="list-item-delete"><i class="fa-solid fa-times"></i></button>
      </div>
    `,
      )
      .join('');
  }

  /**
   * 创建布尔变量卡片
   * @param name 变量名称
   * @param value 布尔值
   * @returns 布尔变量卡片jQuery对象
   */
  private createBooleanCard(name: string, value: boolean): JQuery<HTMLElement> {
    const card = $(`
      <div class="variable-card" data-type="boolean" data-name="${name}">
        <div class="variable-card-header">
          <div class="variable-title-container">
            <i class="fa-solid fa-toggle-on"></i>
            <input type="text" class="variable-title" value="${name}" placeholder="变量名称">
          </div>
          <div class="variable-actions">
            <button class="variable-action-btn save-btn" title="保存">
              <i class="fa-regular fa-save"></i>
            </button>
            <button class="variable-action-btn delete-btn" title="删除">
              <i class="fa-regular fa-trash-can"></i>
            </button>
          </div>
        </div>
        <div class="variable-card-content">
          <div class="boolean-input-container">
            <div class="boolean-buttons-container">
              <button class="boolean-btn ${value ? 'active' : ''}" data-value="true">True</button>
              <button class="boolean-btn ${!value ? 'active' : ''}" data-value="false">False</button>
            </div>
          </div>
        </div>
      </div>
    `);

    card.find('.boolean-btn').on('click', function () {
      card.find('.boolean-btn').removeClass('active');
      $(this).addClass('active');
    });

    return card;
  }

  /**
   * 创建数字变量卡片
   * @param name 变量名称
   * @param value 数字值
   * @returns 数字变量卡片jQuery对象
   */
  private createNumberCard(name: string, value: number): JQuery<HTMLElement> {
    const card = $(`
      <div class="variable-card" data-type="number" data-name="${name}">
        <div class="variable-card-header">
          <div class="variable-title-container">
            <i class="fa-solid fa-hashtag"></i>
            <input type="text" class="variable-title" value="${name}" placeholder="变量名称">
          </div>
          <div class="variable-actions">
            <button class="variable-action-btn save-btn" title="保存">
              <i class="fa-regular fa-save"></i>
            </button>
            <button class="variable-action-btn delete-btn" title="删除">
              <i class="fa-regular fa-trash-can"></i>
            </button>
          </div>
        </div>
        <div class="variable-card-content">
          <input type="number" class="number-input variable-content-input" value="${value}" step="any">
        </div>
      </div>
    `);

    return card;
  }

  /**
   * 创建对象变量卡片
   * @param name 变量名称
   * @param value 对象值
   * @returns 对象变量卡片jQuery对象
   */
  private createObjectCard(name: string, value: object): JQuery<HTMLElement> {
    const jsonString = JSON.stringify(value, null, 2);

    const card = $(`
      <div class="variable-card" data-type="object" data-name="${name}">
        <div class="variable-card-header">
          <div class="variable-title-container">
            <i class="fa-solid fa-code"></i>
            <input type="text" class="variable-title" value="${name}" placeholder="变量名称">
          </div>
          <div class="variable-actions">
            <button class="variable-action-btn save-btn" title="保存">
              <i class="fa-regular fa-save"></i>
            </button>
            <button class="variable-action-btn delete-btn" title="删除">
              <i class="fa-regular fa-trash-can"></i>
            </button>
          </div>
        </div>
        <div class="variable-card-content">
          <textarea class="json-input variable-content-input" placeholder="输入JSON对象">${jsonString}</textarea>
        </div>
      </div>
    `);

    return card;
  }

  /**
   * 创建字符串变量卡片
   * @param name 变量名称
   * @param value 字符串值
   * @returns 字符串变量卡片jQuery对象
   */
  private createStringCard(name: string, value: string): JQuery<HTMLElement> {
    const card = $(`
      <div class="variable-card" data-type="string" data-name="${name}">
        <div class="variable-card-header">
          <div class="variable-title-container">
            <i class="fa-solid fa-font"></i>
            <input type="text" class="variable-title" value="${name}" placeholder="变量名称">
          </div>
          <div class="variable-actions">
            <button class="variable-action-btn save-btn" title="保存">
              <i class="fa-regular fa-save"></i>
            </button>
            <button class="variable-action-btn delete-btn" title="删除">
              <i class="fa-regular fa-trash-can"></i>
            </button>
          </div>
        </div>
        <div class="variable-card-content">
          <textarea class="string-input variable-content-input" placeholder="输入字符串值">${value}</textarea>
        </div>
      </div>
    `);

    return card;
  }
}
