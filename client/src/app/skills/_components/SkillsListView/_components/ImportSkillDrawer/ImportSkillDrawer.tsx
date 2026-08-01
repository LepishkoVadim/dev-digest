/* ImportSkillDrawer — File + Community import. (URL tab is out of scope.)
   Imported skills come back disabled; server wraps bodies as untrusted data. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal, FormField, TextInput, Textarea, Icon, Skeleton, ErrorState, EmptyState } from "@devdigest/ui";
import { useToast } from "../../../../../../lib/toast";
import {
  useImportSkillFile,
  useImportSkillZip,
  useCommunitySkills,
  useImportCommunitySkill,
} from "../../../../../../lib/hooks/skills";
import { MODAL_WIDTH, type ImportTab } from "./constants";
import { isZip, toBase64 } from "./helpers";
import { s } from "./styles";

export function ImportSkillDrawer({ initialTab = "file", onClose }: { initialTab?: ImportTab; onClose: () => void }) {
  const t = useTranslations("skills");
  const [tab, setTab] = React.useState<ImportTab>(initialTab);

  return (
    <Modal width={MODAL_WIDTH} title={t("drawer.title")} subtitle={t("drawer.subtitle")} onClose={onClose}>
      <div style={s.tabs}>
        <button style={s.tab(tab === "file")} onClick={() => setTab("file")}>
          {t("drawer.tabs.file")}
        </button>
        <button style={s.tab(tab === "community")} onClick={() => setTab("community")}>
          {t("drawer.tabs.community")}
        </button>
      </div>
      {tab === "file" ? <FileTab onClose={onClose} /> : <CommunityTab />}
    </Modal>
  );
}

function FileTab({ onClose }: { onClose: () => void }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const importFile = useImportSkillFile();
  const importZip = useImportSkillZip();
  const [name, setName] = React.useState("");
  const [body, setBody] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);

  const pending = importFile.isPending || importZip.isPending;

  const submit = async () => {
    const trimmedName = name.trim() || undefined;
    let skill;
    if (file && isZip(file.name)) {
      const data = toBase64(await file.arrayBuffer());
      skill = await importZip.mutateAsync({ name: trimmedName, data });
    } else {
      const text = file ? await file.text() : body;
      skill = await importFile.mutateAsync({ name: trimmedName, body: text });
    }
    toast.success(t("file.success", { name: skill.name }));
    onClose();
  };

  const canSubmit = !!file || body.trim().length > 0;

  return (
    <>
      <div style={s.body}>
        <FormField label={t("drawer.tabs.file")}>
          <input
            type="file"
            accept=".md,.markdown,.zip"
            style={s.fileInput}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </FormField>
        <FormField label={t("file.nameLabel")} hint={t("file.nameHint")}>
          <TextInput value={name} onChange={setName} placeholder={t("file.namePlaceholder")} mono />
        </FormField>
        <FormField label={t("file.bodyLabel")} hint={t("file.bodyHint")}>
          <Textarea
            value={body}
            onChange={setBody}
            rows={8}
            mono
            placeholder={t("file.bodyPlaceholder")}
          />
        </FormField>
      </div>
      <div style={{ ...s.body, paddingTop: 0 }}>
        <div style={s.footer}>
          <Button kind="primary" icon="Upload" onClick={submit} disabled={pending || !canSubmit}>
            {pending ? t("file.importing") : t("file.import")}
          </Button>
        </div>
      </div>
    </>
  );
}

function CommunityTab() {
  const t = useTranslations("skills");
  const toast = useToast();
  const { data: skills, isLoading, isError, refetch } = useCommunitySkills();
  const importCommunity = useImportCommunitySkill();
  const [search, setSearch] = React.useState("");
  const [importing, setImporting] = React.useState<string | null>(null);

  const q = search.trim().toLowerCase();
  const list = (skills ?? []).filter((sk) =>
    !q ? true : `${sk.name} ${sk.desc} ${sk.repo} ${sk.lang}`.toLowerCase().includes(q),
  );

  const doImport = async (name: string) => {
    setImporting(name);
    try {
      const skill = await importCommunity.mutateAsync({ name });
      toast.success(t("file.success", { name: skill.name }));
    } finally {
      setImporting(null);
    }
  };

  return (
    <div style={s.body}>
      <div style={{ position: "relative" }}>
        <TextInput value={search} onChange={setSearch} placeholder={t("community.searchPlaceholder")} />
      </div>
      {isLoading && (
        <>
          <Skeleton height={56} />
          <Skeleton height={56} />
          <Skeleton height={56} />
        </>
      )}
      {isError && <ErrorState body={t("community.loadError")} onRetry={() => refetch()} />}
      {!isLoading && !isError && list.length === 0 && (
        <EmptyState icon="Search" title={t("community.noMatch.title")} body={t("community.noMatch.body")} />
      )}
      {list.length > 0 && (
        <div style={s.list}>
          {list.map((sk) => (
            <div key={`${sk.repo}/${sk.name}`} style={s.commRow}>
              <div style={s.commMain}>
                <div style={s.commName}>{sk.name}</div>
                <div style={s.commMeta}>
                  <span>{sk.repo}</span>
                  <span>
                    <Icon.Star size={11} /> {sk.stars}
                  </span>
                  <span>{sk.lang}</span>
                </div>
                <div style={s.commDesc}>{sk.desc}</div>
              </div>
              <Button
                kind="secondary"
                size="sm"
                icon="Plus"
                onClick={() => doImport(sk.name)}
                disabled={importing === sk.name}
              >
                {importing === sk.name ? t("community.importing") : t("community.import")}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
