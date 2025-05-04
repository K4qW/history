import {SYSTEM, USER} from "../core/manager.js";

const bgc = '#3736bb'
const bgcg = '#de81f1'
// const bgc = 'var(--SmartThemeBotMesBlurTintColor)'
// const bgcg = 'var(--SmartThemeUserMesBlurTintColor)'
const tc = '#fff'

export async function newPopupConfirm(text, cancelText = 'Cancel', confirmText = 'Confirm', id = '') {
    return await new PopupConfirm().show(text, cancelText, confirmText);
}

export class PopupConfirm {
    constructor() {
        this.uid = SYSTEM.generateRandomString(10);
        this.confirm = false;
        this.toastContainer = null;
        this.toastElement = null;
        this.resolvePromise = null;
        this._text = '';
        this.messageText = null; // 保存文本元素的引用
    }

    // 添加text属性的getter和setter
    get text() {
        return this._text;
    }

    set text(value) {
        this._text = value;
        // 如果messageText元素已创建，则更新其内容
        if (this.messageText) {
            this.messageText.textContent = value;
        }
    }

    async show(message = 'Are you sure?', cancelText = 'Cancel', confirmText = 'Confirm') {
        // 设置初始文本
        this._text = message;

        // Check if toast container exists, if not create one
        this.toastContainer = document.getElementById('toast-container');
        if (!this.toastContainer) {
            this.toastContainer = document.createElement('div');
            this.toastContainer.id = 'toast-container';
            this.toastContainer.className = 'toast-top-center';

            document.body.appendChild(this.toastContainer);
        }

        // Create toast element
        this.toastElement = document.createElement('div');
        this.toastElement.id = this.uid;
        this.toastElement.className = 'toast toast-confirm';
        this.toastElement.setAttribute('aria-live', 'polite');

        this.toastElement.style.padding = '6px 12px';
        this.toastElement.style.pointerEvents = 'auto';
        this.toastElement.style.cursor = 'normal';
        this.toastElement.style.boxShadow = '0 0 10px rgba(0, 0, 0, 1)';
        this.toastElement.style.transform = 'translateY(-30px)';
        this.toastElement.style.opacity = '0';
        this.toastElement.style.transition = 'all 0.3s ease';

        this.toastElement.style.background = `linear-gradient(to bottom right, ${bgc} 20%, ${bgcg})`;
        this.toastElement.style.backdropFilter = 'blur(calc(var(--SmartThemeBlurStrength)*2))';
        this.toastElement.style.webkitBackdropFilter = 'blur(var(--SmartThemeBlurStrength))';

        // Create message container
        const messageEl = $('<div class="toast-message"></div>')[0];
        const messageIcon = $('<i class="fa-solid fa-code-branch""></i>')[0];
        this.messageText = $('<span id="toast_message_text"></span>')[0]; // 保存为类属性
        messageEl.style.display = 'flex';
        messageEl.style.flexDirection = 'row';
        messageEl.style.alignItems = 'center';
        messageEl.style.marginTop = '5px';
        messageEl.style.marginBottom = '10px';
        messageEl.style.color = tc;
        messageEl.style.fontWeight = 'bold';
        messageEl.style.gap = '10px';

        messageIcon.style.fontSize = '1.3rem';
        messageIcon.style.padding = '0'
        messageIcon.style.margin = '0'

        this.messageText.textContent = this._text; // 使用存储的text值
        messageEl.appendChild(messageIcon);
        messageEl.appendChild(this.messageText);

        // Create buttons container
        const buttons = document.createElement('div');
        buttons.style.display = 'flex';
        buttons.style.justifyContent = 'flex-end';
        buttons.style.gap = '10px';

        // Create confirm button
        const confirmBtn = document.createElement('button');
        confirmBtn.textContent = confirmText;
        confirmBtn.style.width = '100%'
        confirmBtn.style.padding = '3px 12px';
        confirmBtn.style.backgroundColor = bgc;
        confirmBtn.style.color = tc;
        confirmBtn.style.border = 'none';
        confirmBtn.style.borderRadius = '6px';
        confirmBtn.style.cursor = 'pointer';
        confirmBtn.style.fontSize = '0.85rem';
        confirmBtn.style.fontWeight = 'bold';
        confirmBtn.classList.add('popup-button-ok', 'menu_button', 'result-control', 'interactable')

        // Create cancel button
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = cancelText;
        cancelBtn.style.width = '100%'
        cancelBtn.style.padding = '3px 12px';
        cancelBtn.style.background = 'none';
        // cancelBtn.style.backgroundColor = bgcg;
        cancelBtn.style.color = tc;
        cancelBtn.style.border = `1px solid ${bgc}`;
        cancelBtn.style.borderRadius = '6px';
        cancelBtn.style.cursor = 'pointer';
        cancelBtn.style.fontSize = '0.85rem';
        cancelBtn.classList.add('popup-button-cancel', 'menu_button', 'result-control', 'interactable')

        // Build the DOM structure
        buttons.appendChild(cancelBtn);
        buttons.appendChild(confirmBtn);
        // this.toastElement.appendChild(closeButton);
        this.toastElement.appendChild(messageEl);
        this.toastElement.appendChild(buttons);
        // this.toastContainer.appendChild(this.toastElement);
        // 插入到容器的顶部而不是底部
        this.toastContainer.insertBefore(this.toastElement, this.toastContainer.firstChild);

        // Trigger animation
        setTimeout(() => {
            this.toastElement.style.transform = 'translateY(0)';
            this.toastElement.style.opacity = '1';
        }, 10);

        // Return a promise that resolves when user clicks a button
        return new Promise((resolve) => {
            this.resolvePromise = resolve;

            const cleanup = () => {
                // Start fade out animation
                // this.toastElement.style.transform = 'translateY(-30px)';
                this.toastElement.style.opacity = '0';

                // Remove element after animation completes
                setTimeout(() => {
                    if (this.toastElement && this.toastElement.parentNode) {
                        this.toastContainer.removeChild(this.toastElement);
                    }
                    // Remove container if it's empty
                    if (this.toastContainer && this.toastContainer.children.length === 0) {
                        document.body.removeChild(this.toastContainer);
                    }
                    this.toastElement = null;
                }, 300);
            };

            confirmBtn.onclick = () => {
                this.confirm = true;
                cleanup();
                resolve(true);
            };

            cancelBtn.onclick = () => {
                this.confirm = false;
                cleanup();
                resolve(false);
            };
        });
    }

    // 关闭弹窗
    close() {
        this.cancelFrameUpdate();
        if (this.toastElement) {
            // this.toastElement.style.transform = 'translateY(-30px)';
            this.toastElement.style.opacity = '0';
            setTimeout(() => {
                this.toastContainer.removeChild(this.toastElement);
                if (this.toastContainer.children.length === 0) {
                    document.body.removeChild(this.toastContainer);
                }
            }, 300);
        }
    }

    frameUpdate(callback) {
        // 清理现有的动画循环
        this.cancelFrameUpdate();

        // 只在菜单显示时启动动画循环
        if (this.toastElement.style.display !== 'none') {
            const updateLoop = (timestamp) => {
                // 如果菜单被隐藏，停止循环
                if (this.toastElement.style.display === 'none') {
                    this.cancelFrameUpdate();
                    return;
                }

                callback(this, timestamp); // 添加 timestamp 参数以便更精确的动画控制
                this._frameUpdateId = requestAnimationFrame(updateLoop);
            };

            this._frameUpdateId = requestAnimationFrame(updateLoop);
        }
    }

    cancelFrameUpdate() {
        if (this._frameUpdateId) {
            cancelAnimationFrame(this._frameUpdateId);
            this._frameUpdateId = null;
        }
    }
}

// 获取计算后的颜色值并确保完全不透明
// function getSolidColor (target) {
//     const colorValue = getComputedStyle(document.documentElement)
//         .getPropertyValue(target).trim();
//
//     // 创建临时元素来解析颜色
//     const tempEl = document.createElement('div');
//     tempEl.style.color = colorValue;
//     document.body.appendChild(tempEl);
//
//     // 获取计算后的 RGB 值
//     const rgb = getComputedStyle(tempEl).color;
//     document.body.removeChild(tempEl);
//
//     // 确保返回的是 rgb() 格式（不带 alpha）
//     return rgb.startsWith('rgba') ? rgb.replace(/,[^)]+\)/, ')') : rgb;
// }
