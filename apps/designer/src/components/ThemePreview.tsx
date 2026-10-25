import { useState, type CSSProperties } from "react";
import * as Checkbox from "@radix-ui/react-checkbox";
import * as ToggleGroup from "@radix-ui/react-toggle-group";
import type { ThemeTokens } from "@cus/core";
import { themeVariables } from "@cus/export";
import { Modal } from "./Modal";
import { usePreviewSpace } from "./PreviewSpace";
import { useT } from "../i18n";

const roles = ["success", "warning", "danger", "info"] as const;
const roleKeys = {
  success: "preview.roleSuccess",
  warning: "preview.roleWarning",
  danger: "preview.roleDanger",
  info: "preview.roleInfo",
} as const;
/** §28：预览密度上下文。 */
export type PreviewDensity = "comfortable" | "compact" | "dense";
export function ThemePreview({
  tokens,
  density = "comfortable",
}: {
  tokens: ThemeTokens;
  density?: PreviewDensity;
}) {
  const t = useT();
  const space = usePreviewSpace();
  const navKeys = ["preview.navOverview", "preview.navProjects", "preview.navSettings"] as const;
  const navValues = ["总览", "项目", "设置"] as const;
  const [nav, setNav] = useState<string>(navValues[0]);
  const [selected, setSelected] = useState<string[]>([t("preview.brandExperience")]);
  const [projects, setProjects] = useState([
    t("preview.brandExperience"),
    t("preview.redesignProject"),
    t("preview.sampleHeading"),
  ]);
  const [dialog, setDialog] = useState(false);
  const [notice, setNotice] = useState(t("preview.readyNotice"));
  const [loading, setLoading] = useState(false);
  function save() {
    setLoading(true);
    window.setTimeout(() => {
      setLoading(false);
      setNotice(t("preview.settingsApplied"));
    }, 800);
  }
  const densitySuffix = density === "compact"
    ? t("preview.densityCompact")
    : density === "dense"
      ? t("preview.densityDense")
      : "";
  const navIndex = nav === navValues[0] ? 0 : nav === navValues[1] ? 1 : 2;
  const titleKeys = ["preview.titleOverview", "preview.titleProjects", "preview.titleSettings"] as const;
  const descKeys = ["preview.descOverview", "preview.descProjects", "preview.descSettings"] as const;
  return (
    <section
      className="theme-preview"
      data-theme={tokens.mode}
      data-density={density}
      aria-label={t("preview.ariaLabel", { mode: tokens.mode, density: densitySuffix })}
      style={themeVariables(tokens, space) as CSSProperties}
    >
      <div className="preview-title">
        <span>
          <span className="mode-dot" />
          {tokens.mode === "light" ? t("preview.lightTheme") : t("preview.darkTheme")}
        </span>
        <span className="mono">{tokens.mode.toUpperCase()}</span>
      </div>
      <nav className="sample-nav" aria-label={t("preview.ariaNav", { mode: tokens.mode })}>
        <span className="sample-logo">
          ◈ <b>studio</b>
        </span>
        <ToggleGroup.Root
          type="single"
          value={nav}
          aria-label={t("preview.ariaView", { mode: tokens.mode })}
          onValueChange={(value) => {
            if (value) setNav(value);
          }}
        >
          {navValues.map((n, i) => (
            <ToggleGroup.Item key={n} value={n}>
              {t(navKeys[i])}
            </ToggleGroup.Item>
          ))}
        </ToggleGroup.Root>
        <span className="avatar">S</span>
      </nav>
      <div className="preview-content">
        <div className="sample-heading">
          <div>
            <span className="sample-caption">{t("preview.sampleHeading")}</span>
            <h3>{t(titleKeys[navIndex])}</h3>
            <p>{t(descKeys[navIndex])}</p>
          </div>
        </div>
        {nav !== navValues[2] && (
          <>
            <div className="sample-card project-card">
              <div className="row">
                <span className="project-icon">✳</span>
                <span className="sample-badge" data-role="info">
                  {t("preview.brandExperience")}
                </span>
              </div>
              <h4>{t("preview.redesignProject")}</h4>
              <p>{t("preview.redesignDesc")}</p>
              <div className="row progress-label">
                <span>{t("preview.projectProgress")}</span>
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
                  {t("preview.tasksCount", { total: projects.length, count: selected.length })}
                </span>
                <button
                  className="sample-button"
                  onClick={() => setDialog(true)}
                >
                  {t("preview.newProject")} <span>＋</span>
                </button>
              </div>
            </div>
            <div className="sample-section-title">
              <h4>{t("preview.recentProjects")}</h4>
              <span className="sample-muted">{t("preview.projectCount", { count: projects.length })}</span>
            </div>
            <div className="sample-table-wrap">
              <table className="sample-table">
                <thead>
                  <tr>
                    <th>{t("preview.colProjectName")}</th>
                    <th>{t("preview.colStatus")}</th>
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
                          {t(roleKeys[roles[i % 4]])}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {nav !== navValues[1] && (
          <form
            className="sample-form"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <label>
              {t("preview.receiveUpdates")}
              <input
                aria-label={t("preview.ariaEmail", { mode: tokens.mode })}
                type="email"
                required
                placeholder="you@studio.design"
              />
            </label>
            <button className="sample-button secondary" disabled={loading}>
              {loading ? t("preview.saving") : t("preview.saveSettings")}
            </button>
          </form>
        )}
        <div className="sample-alert" data-role="success" role="status">
          <b>✓</b>
          <span>{notice}</span>
        </div>
        <div className="sample-section-title">
          <h4>{t("preview.interactionStates")}</h4>
          <span className="sample-muted">{t("preview.tryHoverTab")}</span>
        </div>
        <div className="state-grid">
          {[
            ["default", "preview.stateDefault"],
            ["hover", "preview.stateHover"],
            ["active", "preview.stateActive"],
            ["focus", "preview.stateFocus"],
            ["disabled", "preview.stateDisabled"],
            ["selected", "preview.stateSelected"],
            ["loading", "preview.stateLoading"],
          ].map(([state, labelKey]) => (
            <button
              key={state}
              className="sample-button"
              data-state={state}
              disabled={state === "disabled" || state === "loading"}
              aria-busy={state === "loading"}
              aria-pressed={state === "selected" ? true : undefined}
              onClick={() => setNotice(t("preview.experiencedState", { label: t(labelKey as Parameters<typeof t>[0]) }))}
            >
              {state === "loading" && <span className="spinner" />}
              {t(labelKey as Parameters<typeof t>[0])}
            </button>
          ))}
        </div>
        <div className="feedback-samples">
          {roles.map((role) => (
            <span key={role} className="sample-badge" data-role={role}>
              {t(roleKeys[role])}
            </span>
          ))}
        </div>
      </div>
      <footer className="sample-footer">
        <span>{t("preview.sampleFooter")}</span>
        <span>{t("preview.cusPreview")}</span>
      </footer>
      {dialog && (
        <Modal
          title={t("preview.modalTitle")}
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
                setNotice(t("preview.nameEmptyOrExists"));
                setDialog(false);
                return;
              }
              setProjects([...projects, name]);
              setDialog(false);
              setNotice(t("preview.projectCreated", { name }));
            }}
          >
            <label>
              {t("preview.colProjectName")}
              <input
                name="name"
                required
                maxLength={40}
                autoFocus
                placeholder={t("preview.namePlaceholder")}
              />
            </label>
            <p>{t("preview.localPreviewDesc")}</p>
            <div className="dialog-actions">
              <button
                type="button"
                className="sample-button secondary"
                onClick={() => setDialog(false)}
              >
                {t("preview.cancel")}
              </button>
              <button className="sample-button">{t("preview.createProject")}</button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
