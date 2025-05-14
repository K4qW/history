import {BASE, DERIVED, EDITOR, SYSTEM, USER} from '../../core/manager.js';

const histories = `
<style>
.cell-history {
    position: relative;
    display: flex;
    flex: 1;
    flex-direction: column;
    width: 100%;
    height: 100%;
    padding: 10px;
}
.cell-history-content {
    position: relative;
    display: flex;
    flex: 1;
    flex-direction: column;
    overflow-y: auto;
}
.history-sheets-content {
    display: flex;
    flex: 1;
    flex-direction: column;
    width: 100%;
}
.history-sheet-container {
    display: none;
    border-radius: 5px;
    height: 100%;
}
.history-sheet-container.active {
    display: flex;
    flex: 1;
    border: 1px solid rgba(255, 255, 255, 0.2);
}
.history-cell-list {
    overflow-y: auto;
    width: 100%;
    /* 防止内容跳动 */
    will-change: transform;
    transform: translateZ(0);
}
.history-cell-item {
    display: flex;
    flex: 1;
    width: 100%;
    justify-content: space-between;
    margin-bottom: 5px;
    padding: 5px;
    background-color: rgba(0, 0, 0, 0.2);
    border-radius: 3px;
}
</style>

<div class="cell-history">
    <h3>表格单元格历史记录</h3>
<!--    <div class="history-tabs">-->
<!--        &lt;!&ndash; 动态生成tabs &ndash;&gt;-->
<!--    </div>-->
    <div class="cell-history-content">
        <div class="history-sheets-content">
            <!-- 动态生成的单元格历史记录内容 -->
        </div>
    </div>
</div>
`

function scrollToBottom(container) {
    // 在弹窗显示后滚动到底部
    const contentContainer = $(container).find('.cell-history-content');
    contentContainer.scrollTop(contentContainer[0].scrollHeight);
}

function updateCellHistoryData(container, cell) {
    const { piece, deep } = BASE.getLastSheetsPiece();
    const sheetsData = BASE.sheetsData.context;
    if (!piece || !piece.hash_sheets) return;

    // 获取内容容器
    const contentContainer = $(container).find('.cell-history-content');

    const cellHistory = cell.parent.cellHistory
    const selfHistory = cellHistory.filter(c => {
        if (c.coordUid === cell.coordUid) {
            return c
        } else {
            return false
        }
    });

    // 清空现有内容
    const sheetsContainer = $(contentContainer).find('.history-sheets-content');
    sheetsContainer.empty();

    // 如果没有历史数据，显示提示
    if (!selfHistory || selfHistory.length === 0) {
        sheetsContainer.append('<div class="history-empty">此单元格没有历史数据</div>');
        return;
    }

    // 创建单元格历史内容区域
    const historyContainer = $('<div class="history-sheet-container active"></div>');
    const cellListContainer = $('<div class="history-cell-list"></div>');

    // 遍历历史记录
    selfHistory.forEach(historyCell => {
        // 只显示有值的历史记录
        if (!historyCell.data || !historyCell.data.value) return;

        // 创建历史条目
        const historyItem = $('<div class="history-cell-item"></div>');
        const valueElement = $(`<div class="history-cell-value">${historyCell.data.value}</div>`);
        const timestampElement = $(`<div class="history-cell-timestamp">${historyCell.uid.slice(-4)}</div>`);

        historyItem.append(valueElement);
        historyItem.append(timestampElement);

        cellListContainer.append(historyItem);
    });

    historyContainer.append(cellListContainer);
    sheetsContainer.append(historyContainer);
}

/**
 * 打开表格编辑历史记录弹窗
 * */
export async function openCellHistoryPopup(cell){
    const cellHistoryPopup = new EDITOR.Popup(histories, EDITOR.POPUP_TYPE.TEXT, '', { large: true, wide: true, allowVerticalScrolling: false });
    const historyContainer = $(cellHistoryPopup.dlg)[0];

    updateCellHistoryData(historyContainer, cell);

    await cellHistoryPopup.show();

    scrollToBottom(historyContainer);
}
