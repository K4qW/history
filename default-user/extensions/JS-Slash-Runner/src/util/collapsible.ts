/**
 * 折叠展开配置接口
 */
export interface CollapsibleOptions {
  /** 触发器选择器 */
  headerSelector: string;
  /** 内容选择器 */
  contentSelector: string;
  /** 展开状态的类名 */
  expandedClass?: string;
  /** 动画持续时间(毫秒) */
  animationDuration?: {
    expand: number;
    collapse: number;
  };
  /** 动画缓动函数 */
  easingFunction?: string;
  /** 初始状态是否展开 */
  initiallyExpanded?: boolean;
  /** 回调函数 */
  callbacks?: {
    beforeExpand?: () => void;
    afterExpand?: () => void;
    beforeCollapse?: () => void;
    afterCollapse?: () => void;
  };
}

/**
 * 折叠展开功能类
 */
export class Collapsible {
  private $container: JQuery;
  private $header: JQuery;
  private $content: JQuery;
  private options: CollapsibleOptions;
  private isAnimating: boolean = false;

  /**
   * 静态方法：初始化所有符合选择器的元素为可折叠元素
   * @param containerSelector 容器选择器
   * @param options 配置选项
   * @returns Collapsible实例数组
   */
  public static initAll(containerSelector: string, options: Partial<CollapsibleOptions> = {}): Collapsible[] {
    const instances: Collapsible[] = [];
    $(containerSelector).each(function () {
      instances.push(new Collapsible($(this), options));
    });
    return instances;
  }

  /**
   * 构造函数
   * @param $container 容器元素
   * @param options 配置选项
   */
  constructor($container: JQuery, options: Partial<CollapsibleOptions> = {}) {
    this.$container = $container;

    // 默认配置
    const defaultOptions: CollapsibleOptions = {
      headerSelector: '.collapsible-header',
      contentSelector: '.collapsible-content',
      expandedClass: 'expanded',
      animationDuration: {
        expand: 280,
        collapse: 250,
      },
      easingFunction: 'swing',
      initiallyExpanded: false,
      callbacks: {},
    };

    // 合并配置
    this.options = { ...defaultOptions, ...options };

    // 获取元素
    this.$header = this.$container.find(this.options.headerSelector);
    this.$content = this.$container.find(this.options.contentSelector);

    // 初始化事件
    this.initEvents();

    // 设置初始状态
    if (!this.options.initiallyExpanded) {
      this.$container.removeClass(this.options.expandedClass);
      this.$content.hide();
    } else {
      this.$container.addClass(this.options.expandedClass!);
      this.$content.show();
    }
  }

  /**
   * 初始化事件
   */
  private initEvents(): void {
    this.$header.on('click', () => {
      this.toggle();
    });
  }

  /**
   * 切换展开/折叠状态
   */
  public toggle(): void {
    if (this.isAnimating) return;

    if (this.$container.hasClass(this.options.expandedClass!)) {
      this.collapse();
    } else {
      this.expand();
    }
  }

  /**
   * 展开内容
   */
  public expand(): void {
    if (this.isAnimating || this.$container.hasClass(this.options.expandedClass!)) return;

    this.isAnimating = true;

    // 执行展开前回调
    if (this.options.callbacks?.beforeExpand) {
      this.options.callbacks.beforeExpand();
    }

    this.$container.addClass(this.options.expandedClass!);
    this.$content.addClass('animating');

    this.$content.slideDown({
      duration: this.options.animationDuration!.expand,
      easing: this.options.easingFunction,
      start: function () {
        $(this).css({
          opacity: 0,
          transform: 'translateY(-10px) scaleY(0.95)',
        });
      },
      progress: function (_animation, progress) {
        $(this).css({
          opacity: progress,
          transform: `translateY(${-10 * (1 - progress)}px) scaleY(${0.95 + 0.05 * progress})`,
        });
      },
      complete: () => {
        this.$content
          .css({
            opacity: '',
            transform: '',
          })
          .removeClass('animating');

        this.isAnimating = false;

        // 执行展开后回调
        if (this.options.callbacks?.afterExpand) {
          this.options.callbacks.afterExpand();
        }
      },
    });
  }

  /**
   * 折叠内容
   */
  public collapse(): void {
    if (this.isAnimating || !this.$container.hasClass(this.options.expandedClass!)) return;

    this.isAnimating = true;

    // 执行折叠前回调
    if (this.options.callbacks?.beforeCollapse) {
      this.options.callbacks.beforeCollapse();
    }

    this.$container.removeClass(this.options.expandedClass!);
    this.$content.addClass('animating');

    this.$content.slideUp({
      duration: this.options.animationDuration!.collapse,
      easing: this.options.easingFunction,
      start: function () {
        $(this).css({
          opacity: 1,
          transform: 'translateY(0) scaleY(1)',
        });
      },
      progress: function (_animation, progress) {
        const inverseProgress = 1 - progress;
        $(this).css({
          opacity: inverseProgress,
          transform: `translateY(${-5 * progress}px) scaleY(${1 - 0.05 * progress})`,
        });
      },
      complete: () => {
        this.$content
          .css({
            opacity: '',
            transform: '',
          })
          .removeClass('animating');

        this.isAnimating = false;

        // 执行折叠后回调
        if (this.options.callbacks?.afterCollapse) {
          this.options.callbacks.afterCollapse();
        }
      },
    });
  }

  /**
   * 是否已展开
   * @returns 是否已展开
   */
  public isExpanded(): boolean {
    return this.$container.hasClass(this.options.expandedClass!);
  }

  /**
   * 销毁实例，移除事件监听
   */
  public destroy(): void {
    this.$header.off('click');
  }
}
