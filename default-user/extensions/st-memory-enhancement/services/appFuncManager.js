import { saveSettingsDebounced, saveSettings, getSlideToggleOptions, generateRaw, saveChat, eventSource, event_types, getRequestHeaders } from '../../../../../../../script.js';
import { DOMPurify, Bowser, slideToggle } from '../../../../../../../lib.js';
import { extension_settings, getContext, renderExtensionTemplateAsync } from '../../../../../../../scripts/extensions.js';
import { POPUP_TYPE, Popup, callGenericPopup } from '../../../../../../../scripts/popup.js';
import { power_user, applyPowerUserSettings, getContextSettings, loadPowerUserSettings } from "../../../../../../../scripts/power-user.js";
import { LoadLocal, SaveLocal, LoadLocalBool } from '../../../../../../../scripts/f-localStorage.js';
import { getCurrentLocale } from '../../../../../../../scripts/i18n.js';

/**
 * appManager 对象，用于集中管理和暴露常用的应用程序功能和库。
 * 方便在应用程序的不同模块中统一访问和使用这些功能。
 */
const applicationFunctionManager = {
    // script.js 模块
    saveSettingsDebounced,
    saveSettings,
    getSlideToggleOptions,
    generateRaw,
    saveChat,
    eventSource,
    event_types,
    getRequestHeaders,

    // lib.js 模块
    DOMPurify,
    Bowser,
    slideToggle,

    // scripts/extensions.js 模块
    extension_settings,
    getContext,
    renderExtensionTemplateAsync,

    // scripts/popup.js 模块
    POPUP_TYPE,
    Popup,
    callGenericPopup,

    // scripts/power-user.js 模块
    power_user,
    applyPowerUserSettings,
    getContextSettings,
    loadPowerUserSettings,

    // scripts/f-localStorage.js 模块
    LoadLocal,
    SaveLocal,
    LoadLocalBool,

    // scripts/i18n.js 模块
    getCurrentLocale,
};

export default applicationFunctionManager;
