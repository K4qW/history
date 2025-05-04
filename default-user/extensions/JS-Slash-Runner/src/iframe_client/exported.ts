/**
 * 酒馆提供给插件的稳定接口, 具体内容见于 酒馆文件夹/public/scripts/st-context 或 https://github.com/SillyTavern/SillyTavern/blob/release/public/scripts/st-context.js
 * 你也可以在酒馆页面按 f12, 在控制台中输入 `window.SillyTavern.getContext()` 来查看当前酒馆所提供的接口
 */
const SillyTavern = (
  window.parent as unknown as {
    SillyTavern: { getContext: () => Record<string, any> };
  }
).SillyTavern.getContext();

/**
 * 酒馆助手提供的额外功能, 具体内容见于 https://n0vi028.github.io/JS-Slash-Runner-Doc
 * 你也可以在酒馆页面按 f12, 在控制台中输入 `window.TavernHelper` 来查看当前酒馆助手所提供的接口
 */
const TavernHelper = (window.parent as unknown as { TavernHelper: Record<string, any> }).TavernHelper;

for (const key in TavernHelper) {
  (window as any)[key] = TavernHelper[key];
}

const toastr = (window.parent as unknown as { toastr: any }).toastr;

/**
 * 提示词模板语法插件所提供的额外功能, 具体内容见于 https://github.com/zonde306/ST-Prompt-Template
 * 你也可以在酒馆页面按 f12,在控制台中输入 `window.EjsTemplate` 来查看当前提示词模板语法所提供的接口
 */
const EjsTemplate = (window.parent as unknown as { EjsTemplate: Record<string, any> }).EjsTemplate;
