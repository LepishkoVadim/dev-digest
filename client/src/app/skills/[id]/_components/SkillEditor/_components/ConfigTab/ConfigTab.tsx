/* Config tab — name/description/type/enabled + the Markdown skill-body editor.
   Saving a changed body bumps the version server-side; we reflect the new
   v{version} inline like the agent editor's "Saved (vN)". */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { FormField, TextInput, SelectInput, Textarea, Toggle, Button } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { useUpdateSkill } from "../../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../../lib/toast";
import { s } from "./styles";

const TYPE_VALUES: readonly SkillType[] = ["rubric", "convention", "security", "custom"];

/** name → filename slug (lowercase, non-alphanum → hyphen). */
const slug = (name: string) =>
  (name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "skill") + ".md";

export function ConfigTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const update = useUpdateSkill();

  const [name, setName] = React.useState(skill.name);
  const [description, setDescription] = React.useState(skill.description);
  const [type, setType] = React.useState<SkillType>(skill.type);
  const [enabled, setEnabled] = React.useState(skill.enabled);
  const [body, setBody] = React.useState(skill.body);

  // Reset local form when switching skills.
  React.useEffect(() => {
    setName(skill.name);
    setDescription(skill.description);
    setType(skill.type);
    setEnabled(skill.enabled);
    setBody(skill.body);
  }, [skill.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty =
    name !== skill.name ||
    description !== skill.description ||
    type !== skill.type ||
    enabled !== skill.enabled ||
    body !== skill.body;

  // Rough token estimate: ~4 chars/token.
  const tokens = Math.ceil(body.length / 4);

  const typeOptions = TYPE_VALUES.map((v) => ({ value: v, label: t(`listItem.type.${v}`) }));

  const save = () =>
    update.mutate(
      { id: skill.id, patch: { name, description, type, enabled, body } },
      { onSuccess: (data) => toast.success(t("editor.config.savedToast", { version: data.version })) },
    );

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("editor.config.title")}</h2>
        <label style={s.enabledLabel}>
          {t("preview.enabled")}
          <Toggle on={enabled} onChange={setEnabled} size={16} />
        </label>
      </div>
      <FormField label={t("create.fields.name")} required>
        <TextInput value={name} onChange={setName} />
      </FormField>
      <FormField label={t("create.fields.description")}>
        <TextInput value={description} onChange={setDescription} />
      </FormField>
      <FormField label={t("create.fields.type")}>
        <SelectInput value={type} onChange={(v) => setType(v as SkillType)} options={typeOptions} />
      </FormField>
      <FormField label={t("preview.bodyLabel")} hint={t("preview.bodyHint")}>
        <div style={s.bodyMeta}>
          <span className="mono" style={s.filenameChip}>
            {slug(name)}
          </span>
          <span className="tnum">{t("editor.config.tokenEstimate", { count: tokens })}</span>
          {dirty && <span style={s.dirtyDot}>{t("editor.config.unsaved")}</span>}
        </div>
        <Textarea value={body} onChange={setBody} rows={16} mono />
      </FormField>
      <div style={s.actions}>
        <Button kind="primary" icon="Check" onClick={save} disabled={update.isPending || !dirty}>
          {update.isPending ? t("editor.config.saving") : t("editor.config.save")}
        </Button>
        {update.isSuccess && (
          <span style={s.savedNote}>{t("editor.config.saved", { version: update.data?.version })}</span>
        )}
      </div>
    </div>
  );
}
