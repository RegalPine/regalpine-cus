import { useState, type CSSProperties } from "react";
import * as Checkbox from "@radix-ui/react-checkbox";
import * as ToggleGroup from "@radix-ui/react-toggle-group";
import type { ThemeTokens } from "@cus/core";
import { themeVariables } from "@cus/export";
import { Modal } from "./Modal";
import { usePreviewSpace } from "./PreviewSpace";

const roles = ["success", "warning", "danger", "info"] as const;
const roleNames = {
  success: "已完成",
  warning: "进行中",
  danger: "需关注",
  info: "计划中",
};
/** §28：预览密度上下文。 */
export type PreviewDensity = "comfortable" | "compact" | "dense";
export function ThemePreview({
  tokens,
  density = "comfortable",
}: {
  tokens: ThemeTokens;
  density?: PreviewDensity;
}) {
  const space = usePreviewSpace();
  const [nav, setNav] = useState("总览");
  const [selected, setSelected] = useState<string[]>(["品牌色彩系统"]);
  const [projects, setProjects] = useState([
    "品牌色彩系统",
    "产品界面设计",
    "组件库规范",
  ]);
  const [dialog, setDialog] = useState(false);
  const [notice, setNotice] = useState(
    "预览就绪，所有组件使用当前主题 Token。",
  );
  const [loading, setLoading] = useState(false);
  function save() {
    setLoading(true);
    window.setTimeout(() => {
      setLoading(false);
      setNotice("设置已应用到当前预览。");
    }, 800);
  }
  return (
    <section
      className="theme-preview"
      data-theme={tokens.mode}
      data-density={density}
      aria-label={`${tokens.mode} 主题预览${density === "comfortable" ? "" : `（${density === "compact" ? "紧凑" : "密集"}密度）`}`}
      style={themeVariables(tokens, space) as CSSProperties}
    >
      <div className="preview-title">
        <span>
          <span className="mode-dot" />
          {tokens.mode === "light" ? "浅色主题" : "深色主题"}
        </span>
        <span className="mono">{tokens.mode.toUpperCase()}</span>
      </div>
      <nav className="sample-nav" aria-label={`${tokens.mode} 示例导航`}>
        <span className="sample-logo">
          ◈ <b>studio</b>
        </span>
        <ToggleGroup.Root
          type="single"
          value={nav}
          aria-label={`${tokens.mode} 示例视图`}
          onValueChange={(value) => {
            if (value) setNav(value);
          }}
        >
          {["总览", "项目", "设置"].map((n) => (
            <ToggleGroup.Item key={n} value={n}>
              {n}
            </ToggleGroup.Item>
          ))}
        </ToggleGroup.Root>
        <span className="avatar">S</span>
      </nav>
      <div className="preview-content">
        <div className="sample-heading">
          <div>
            <span className="sample-caption">界面样本</span>
            <h3>
              {nav === "总览"
                ? "项目总览"
                : nav === "项目"
                  ? "项目列表"
                  : "偏好设置"}
            </h3>
            <p>
              {nav === "总览"
                ? "汇总进行中的项目与关键进度指标。"
                : nav === "项目"
                  ? "管理全部项目与其当前状态。"
                  : "配置通知与个性化选项。"}
            </p>
          </div>
        </div>
        {nav !== "设置" && (
          <>
            <div className="sample-card project-card">
              <div className="row">
                <span className="project-icon">✳</span>
                <span className="sample-badge" data-role="info">
                  品牌体验
                </span>
              </div>
              <h4>官网视觉改版</h4>
              <p>统一品牌色在官网与后台界面的落地。</p>
              <div className="row progress-label">
                <span>项目进度</span>
                <b>
                  {selected.length
                    ? Math.round((selected.length / projects.length) * 100)
                    : 0}
                  %
                </b>
              </div>
              <div className="sample-progress">
                <i
                  style={{
                    width: `${(selected.length / projects.length) * 100}%`,
                  }}
                />
              </div>
              <div className="row">
                <span className="sample-muted">
                  {projects.length} 个任务 · {selected.length} 个已选择
                </span>
                <button
                  className="sample-button"
                  onClick={() => setDialog(true)}
                >
                  新建项目 <span>＋</span>
                </button>
              </div>
            </div>
            <div className="sample-section-title">
              <h4>近期项目</h4>
              <span className="sample-muted">{projects.length} 个项目</span>
            </div>
            <div className="sample-table-wrap">
              <table className="sample-table">
                <thead>
                  <tr>
                    <th>项目名称</th>
                    <th>状态</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((name, i) => (
                    <tr key={name} data-selected={selected.includes(name)}>
                      <td>
                        <label>
                          <Checkbox.Root
                            className="cus-checkbox"
                            aria-label={name}
                            checked={selected.includes(name)}
                            onCheckedChange={(checked) =>
                              setSelected(
                                checked === true
                                  ? [...selected, name]
                                  : selected.filter((v) => v !== name),
                              )
                            }
                          >
                            <Checkbox.Indicator aria-hidden="true">
                              ✓
                            </Checkbox.Indicator>
                          </Checkbox.Root>
                          {name}
                        </label>
                      </td>
                      <td>
                        <span className="sample-badge" data-role={roles[i % 4]}>
                          {roleNames[roles[i % 4]]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {nav !== "项目" && (
          <form
            className="sample-form"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <label>
              接收项目更新
              <input
                aria-label={`${tokens.mode} 邮箱`}
                type="email"
                required
                placeholder="you@studio.design"
              />
            </label>
            <button className="sample-button secondary" disabled={loading}>
              {loading ? "保存中…" : "保存设置"}
            </button>
          </form>
        )}
        <div className="sample-alert" data-role="success" role="status">
          <b>✓</b>
          <span>{notice}</span>
        </div>
        <div className="sample-section-title">
          <h4>交互状态</h4>
          <span className="sample-muted">试试悬停与 Tab</span>
        </div>
        <div className="state-grid">
          {[
            ["default", "默认"],
            ["hover", "悬停"],
            ["active", "按下"],
            ["focus", "聚焦"],
            ["disabled", "禁用"],
            ["selected", "选中"],
            ["loading", "加载中"],
          ].map(([state, label]) => (
            <button
              key={state}
              className="sample-button"
              data-state={state}
              disabled={state === "disabled" || state === "loading"}
              aria-busy={state === "loading"}
              aria-pressed={state === "selected" ? true : undefined}
              onClick={() => setNotice(`已体验「${label}」状态。`)}
            >
              {state === "loading" && <span className="spinner" />}
              {label}
            </button>
          ))}
        </div>
        <div className="feedback-samples">
          {roles.map((role) => (
            <span key={role} className="sample-badge" data-role={role}>
              {roleNames[role]}
            </span>
          ))}
        </div>
      </div>
      <footer className="sample-footer">
        <span>样本界面 · 仅本地渲染</span>
        <span>CUS 主题预览</span>
      </footer>
      {dialog && (
        <Modal
          title="新建项目"
          className="preview-modal"
          tokens={tokens}
          onClose={() => setDialog(false)}
        >
          <form
            className="dialog-form"
            onSubmit={(e) => {
              e.preventDefault();
              const name = String(
                new FormData(e.currentTarget).get("name") ?? "",
              ).trim();
              if (!name || projects.includes(name)) {
                setNotice("项目名称为空或已存在，请使用其他名称。");
                setDialog(false);
                return;
              }
              setProjects([...projects, name]);
              setDialog(false);
              setNotice(`项目「${name}」已创建。`);
            }}
          >
            <label>
              项目名称
              <input
                name="name"
                required
                maxLength={40}
                autoFocus
                placeholder="给新的灵感起个名字"
              />
            </label>
            <p>这是本地交互预览，不会发送任何网络请求。</p>
            <div className="dialog-actions">
              <button
                type="button"
                className="sample-button secondary"
                onClick={() => setDialog(false)}
              >
                取消
              </button>
              <button className="sample-button">创建项目</button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
