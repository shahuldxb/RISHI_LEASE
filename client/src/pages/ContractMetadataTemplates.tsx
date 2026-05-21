/**
 * VodaLease Enterprise -- Contract Metadata Templates
 * Screen ID: VFCNTMETA0001P001
 * Define reusable field schemas per contract type.
 * Each template defines which metadata fields a contract of that type must carry.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight, GripVertical, Settings2, Tag, ToggleLeft, Hash, Calendar, AlignLeft, List, DollarSign, X } from "lucide-react";
import { toast } from "sonner";

const CONTRACT_TYPES = [
  "Commercial Lease", "Residential Lease", "Equipment Lease",
  "Land Lease", "Vehicle Lease", "Sub-Lease", "Other",
];

const FIELD_TYPES = [
  { value: "text",     label: "Text",      icon: AlignLeft },
  { value: "number",   label: "Number",    icon: Hash },
  { value: "currency", label: "Currency",  icon: DollarSign },
  { value: "date",     label: "Date",      icon: Calendar },
  { value: "boolean",  label: "Yes / No",  icon: ToggleLeft },
  { value: "dropdown", label: "Dropdown",  icon: List },
  { value: "textarea", label: "Long Text", icon: AlignLeft },
];

const FIELD_TYPE_COLORS: Record<string, string> = {
  text:     "bg-blue-500/10 text-blue-400",
  number:   "bg-purple-500/10 text-purple-400",
  currency: "bg-green-500/10 text-green-400",
  date:     "bg-orange-500/10 text-orange-400",
  boolean:  "bg-pink-500/10 text-pink-400",
  dropdown: "bg-yellow-500/10 text-yellow-400",
  textarea: "bg-teal-500/10 text-teal-400",
};

type FieldDraft = {
  fieldId?: number;
  fieldName: string;
  fieldLabel: string;
  fieldType: string;
  dropdownOptions: string[];
  isRequired: boolean;
  displayOrder: number;
  placeholder: string;
  helpText: string;
};

const BLANK_FIELD: FieldDraft = {
  fieldName: "", fieldLabel: "", fieldType: "text",
  dropdownOptions: [], isRequired: false, displayOrder: 0,
  placeholder: "", helpText: "",
};

export default function ContractMetadataTemplates() {
  const utils = trpc.useUtils();

  // Templates list
  const { data: templates, isLoading } = trpc.contractDms.listTemplates.useQuery();

  // Expanded template
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const { data: expandedTemplate, isLoading: loadingFields } = trpc.contractDms.getTemplate.useQuery(
    { templateId: expandedId! },
    { enabled: expandedId !== null }
  );

  // Template CRUD dialog
  const [tmplDialog, setTmplDialog] = useState<{ open: boolean; mode: "create" | "edit"; id?: number; name: string; type: string; desc: string }>({
    open: false, mode: "create", name: "", type: "Commercial Lease", desc: "",
  });

  const createTmpl = trpc.contractDms.createTemplate.useMutation({
    onSuccess: () => { utils.contractDms.listTemplates.invalidate(); toast.success("Template created"); setTmplDialog(d => ({ ...d, open: false })); },
    onError: e => toast.error(e.message),
  });
  const updateTmpl = trpc.contractDms.updateTemplate.useMutation({
    onSuccess: () => { utils.contractDms.listTemplates.invalidate(); toast.success("Template updated"); setTmplDialog(d => ({ ...d, open: false })); },
    onError: e => toast.error(e.message),
  });
  const deleteTmpl = trpc.contractDms.deleteTemplate.useMutation({
    onSuccess: () => { utils.contractDms.listTemplates.invalidate(); toast.success("Template deleted"); setDeleteTmplId(null); },
    onError: e => toast.error(e.message),
  });
  const [deleteTmplId, setDeleteTmplId] = useState<number | null>(null);

  // Field CRUD dialog
  const [fieldDialog, setFieldDialog] = useState<{ open: boolean; templateId: number; draft: FieldDraft }>({
    open: false, templateId: 0, draft: BLANK_FIELD,
  });
  const [dropdownInput, setDropdownInput] = useState("");
  const [deleteFieldId, setDeleteFieldId] = useState<number | null>(null);

  const upsertField = trpc.contractDms.upsertField.useMutation({
    onSuccess: () => {
      utils.contractDms.getTemplate.invalidate({ templateId: fieldDialog.templateId });
      toast.success("Field saved");
      setFieldDialog(d => ({ ...d, open: false }));
    },
    onError: e => toast.error(e.message),
  });
  const deleteField = trpc.contractDms.deleteField.useMutation({
    onSuccess: () => {
      utils.contractDms.getTemplate.invalidate({ templateId: expandedId! });
      toast.success("Field deleted");
      setDeleteFieldId(null);
    },
    onError: e => toast.error(e.message),
  });

  function openCreateTemplate() {
    setTmplDialog({ open: true, mode: "create", name: "", type: "Commercial Lease", desc: "" });
  }
  function openEditTemplate(t: any) {
    setTmplDialog({ open: true, mode: "edit", id: t.template_id, name: t.template_name, type: t.contract_type, desc: t.description ?? "" });
  }
  function saveTmpl() {
    if (!tmplDialog.name.trim()) { toast.error("Template name is required"); return; }
    if (tmplDialog.mode === "create") {
      createTmpl.mutate({ templateName: tmplDialog.name, contractType: tmplDialog.type, description: tmplDialog.desc });
    } else {
      updateTmpl.mutate({ templateId: tmplDialog.id!, templateName: tmplDialog.name, contractType: tmplDialog.type, description: tmplDialog.desc });
    }
  }

  function openAddField(templateId: number) {
    setFieldDialog({ open: true, templateId, draft: { ...BLANK_FIELD, displayOrder: (expandedTemplate?.fields?.length ?? 0) + 1 } });
    setDropdownInput("");
  }
  function openEditField(templateId: number, f: any) {
    setFieldDialog({
      open: true, templateId,
      draft: {
        fieldId: f.field_id, fieldName: f.field_name, fieldLabel: f.field_label,
        fieldType: f.field_type, dropdownOptions: f.dropdown_options ? JSON.parse(f.dropdown_options) : [],
        isRequired: !!f.is_required, displayOrder: f.display_order,
        placeholder: f.placeholder ?? "", helpText: f.help_text ?? "",
      },
    });
    setDropdownInput("");
  }
  function saveField() {
    const d = fieldDialog.draft;
    if (!d.fieldName.trim()) { toast.error("Field name is required"); return; }
    if (!d.fieldLabel.trim()) { toast.error("Field label is required"); return; }
    upsertField.mutate({
      fieldId: d.fieldId,
      templateId: fieldDialog.templateId,
      fieldName: d.fieldName,
      fieldLabel: d.fieldLabel,
      fieldType: d.fieldType as any,
      dropdownOptions: Array.isArray(d.dropdownOptions) ? JSON.stringify(d.dropdownOptions) : (d.dropdownOptions as string | undefined),
      isRequired: d.isRequired,
      displayOrder: d.displayOrder,
      placeholder: d.placeholder || undefined,
      helpText: d.helpText || undefined,
    });
  }

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <ScreenHeader
          screenId="VFCTR-METATEMPL-001" screenType="contract_metadata_templates"
          title="Contract Metadata Templates"
          subtitle="Define reusable field schemas for each contract type"
          icon={<Settings2 className="h-6 w-6 text-blue-400" />}
          actions={
            <Button size="sm" onClick={openCreateTemplate}>
              <Plus className="h-4 w-4 mr-1.5" /> New Template
            </Button>
          }
        />

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : !templates?.length ? (
          <Card>
            <CardContent className="py-16 text-center">
              <Settings2 className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-40" />
              <p className="text-muted-foreground">No templates yet. Create one to define metadata fields for your contract types.</p>
              <Button className="mt-4" size="sm" onClick={openCreateTemplate}><Plus className="h-4 w-4 mr-1.5" />New Template</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {(templates as any[]).map((t: any) => (
              <Card key={t.template_id} className="overflow-hidden">
                <div
                  className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/20 select-none"
                  onClick={() => setExpandedId(expandedId === t.template_id ? null : t.template_id)}
                >
                  <div className="flex items-center gap-3">
                    {expandedId === t.template_id
                      ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    <div>
                      <span className="font-medium text-sm">{t.template_name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{t.contract_type}</span>
                    </div>
                    <Badge variant="outline" className="text-xs">{t.field_count} field{t.field_count !== 1 ? "s" : ""}</Badge>
                    {!t.is_active && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
                  </div>
                  <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditTemplate(t)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteTmplId(t.template_id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {expandedId === t.template_id && (
                  <div className="border-t bg-muted/10">
                    {t.description && (
                      <p className="px-4 pt-3 pb-1 text-xs text-muted-foreground">{t.description}</p>
                    )}
                    <div className="px-4 py-3">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Fields</span>
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openAddField(t.template_id)}>
                          <Plus className="h-3.5 w-3.5 mr-1" /> Add Field
                        </Button>
                      </div>
                      {loadingFields ? (
                        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
                      ) : !expandedTemplate?.fields?.length ? (
                        <p className="text-xs text-muted-foreground py-4 text-center">No fields yet. Add the first field to define the metadata schema.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {(expandedTemplate.fields as any[]).map((f: any) => (
                            <div key={f.field_id} className="flex items-center gap-3 px-3 py-2 rounded-md bg-background border hover:border-primary/30 group">
                              <GripVertical className="h-4 w-4 text-muted-foreground opacity-40" />
                              <Tag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <div className="flex-1 min-w-0">
                                <span className="text-sm font-medium">{f.field_label}</span>
                                <span className="ml-2 text-xs text-muted-foreground font-mono">{f.field_name}</span>
                                {f.help_text && <span className="ml-2 text-xs text-muted-foreground">-- {f.help_text}</span>}
                              </div>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${FIELD_TYPE_COLORS[f.field_type] ?? ""}`}>
                                {FIELD_TYPES.find(ft => ft.value === f.field_type)?.label ?? f.field_type}
                              </span>
                              {f.is_required ? (
                                <span className="text-xs text-red-400 font-medium">Required</span>
                              ) : (
                                <span className="text-xs text-muted-foreground">Optional</span>
                              )}
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEditField(t.template_id, f)}>
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => setDeleteFieldId(f.field_id)}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* ── Template Dialog ── */}
      {tmplDialog.open && (
        <div className="rounded-xl border border-primary/30 bg-card p-5 space-y-4 transition-all duration-200 ease-in-out">
        
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold flex items-center gap-2">{tmplDialog.mode === "create" ? "New Metadata Template" : "Edit Template"}</h4>
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setTmplDialog(d => ({ ...d, open: false }))}><X className="w-3.5 h-3.5" /></Button>
          </div>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Template Name <span className="text-red-400">*</span></Label>
              <Input placeholder="e.g. Commercial Lease Standard Fields" value={tmplDialog.name}
                onChange={e => setTmplDialog(d => ({ ...d, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Contract Type <span className="text-red-400">*</span></Label>
              <Select value={tmplDialog.type} onValueChange={v => setTmplDialog(d => ({ ...d, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONTRACT_TYPES.map(ct => <SelectItem key={ct} value={ct}>{ct}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea placeholder="Optional description of this template's purpose..." rows={2}
                value={tmplDialog.desc} onChange={e => setTmplDialog(d => ({ ...d, desc: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={() => setTmplDialog(d => ({ ...d, open: false }))}>Cancel</Button>
            <Button onClick={saveTmpl} disabled={createTmpl.isPending || updateTmpl.isPending}>
              {tmplDialog.mode === "create" ? "Create Template" : "Save Changes"}
            </Button>
          </div>
        </div>
      )}

      {/* ── Field Dialog ── */}
      {fieldDialog.open && (
        <div className="rounded-xl border border-primary/30 bg-card p-5 space-y-4 transition-all duration-200 ease-in-out">
        
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold flex items-center gap-2">{fieldDialog.draft.fieldId ? "Edit Field" : "Add Field"}</h4>
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setFieldDialog(d => ({ ...d, open: false }))}><X className="w-3.5 h-3.5" /></Button>
          </div>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Field Label <span className="text-red-400">*</span></Label>
                <Input placeholder="e.g. Contract Value" value={fieldDialog.draft.fieldLabel}
                  onChange={e => setFieldDialog(d => ({ ...d, draft: { ...d.draft, fieldLabel: e.target.value } }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Field Name (key) <span className="text-red-400">*</span></Label>
                <Input placeholder="e.g. contract_value" value={fieldDialog.draft.fieldName}
                  onChange={e => setFieldDialog(d => ({ ...d, draft: { ...d.draft, fieldName: e.target.value.replace(/\s+/g, "_").toLowerCase() } }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Field Type</Label>
                <Select value={fieldDialog.draft.fieldType}
                  onValueChange={v => setFieldDialog(d => ({ ...d, draft: { ...d.draft, fieldType: v } }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FIELD_TYPES.map(ft => (
                      <SelectItem key={ft.value} value={ft.value}>{ft.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Display Order</Label>
                <Input type="number" min={0} value={fieldDialog.draft.displayOrder}
                  onChange={e => setFieldDialog(d => ({ ...d, draft: { ...d.draft, displayOrder: +e.target.value } }))} />
              </div>
            </div>
            {fieldDialog.draft.fieldType === "dropdown" && (
              <div className="space-y-1.5">
                <Label>Dropdown Options</Label>
                <div className="flex gap-2">
                  <Input placeholder="Add option and press Enter" value={dropdownInput}
                    onChange={e => setDropdownInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter" && dropdownInput.trim()) {
                        setFieldDialog(d => ({ ...d, draft: { ...d.draft, dropdownOptions: [...d.draft.dropdownOptions, dropdownInput.trim()] } }));
                        setDropdownInput("");
                      }
                    }} />
                  <Button variant="outline" size="sm" onClick={() => {
                    if (dropdownInput.trim()) {
                      setFieldDialog(d => ({ ...d, draft: { ...d.draft, dropdownOptions: [...d.draft.dropdownOptions, dropdownInput.trim()] } }));
                      setDropdownInput("");
                    }
                  }}>Add</Button>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {fieldDialog.draft.dropdownOptions.map((opt, i) => (
                    <Badge key={i} variant="secondary" className="cursor-pointer text-xs" onClick={() =>
                      setFieldDialog(d => ({ ...d, draft: { ...d.draft, dropdownOptions: d.draft.dropdownOptions.filter((_, j) => j !== i) } }))
                    }>{opt} ×</Badge>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Placeholder Text</Label>
              <Input placeholder="Optional placeholder shown in the input" value={fieldDialog.draft.placeholder}
                onChange={e => setFieldDialog(d => ({ ...d, draft: { ...d.draft, placeholder: e.target.value } }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Help Text</Label>
              <Input placeholder="Optional guidance shown below the field" value={fieldDialog.draft.helpText}
                onChange={e => setFieldDialog(d => ({ ...d, draft: { ...d.draft, helpText: e.target.value } }))} />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="required" checked={fieldDialog.draft.isRequired}
                onChange={e => setFieldDialog(d => ({ ...d, draft: { ...d.draft, isRequired: e.target.checked } }))}
                className="h-4 w-4 rounded border-border" />
              <Label htmlFor="required" className="cursor-pointer">Required field (must be filled before creating a lease)</Label>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={() => setFieldDialog(d => ({ ...d, open: false }))}>Cancel</Button>
            <Button onClick={saveField} disabled={upsertField.isPending}>
              {fieldDialog.draft.fieldId ? "Save Changes" : "Add Field"}
            </Button>
          </div>
        </div>
      )}

      {/* ── Delete Template Confirm ── */}
      {deleteTmplId !== null && (
        <div className="rounded-xl border border-red-500/30 bg-card p-5 space-y-4 transition-all duration-200 ease-in-out">
        
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold flex items-center gap-2">Delete Template?</h4>
            <p className="text-xs text-muted-foreground">This will permanently delete the template and all its field definitions. Existing metadata values on contracts will not be affected.</p>
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setDeleteTmplId(null)}><X className="w-3.5 h-3.5" /></Button>
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="outline">Cancel</Button>
            <Button className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTmpl.mutate({ templateId: deleteTmplId! })}>
              Delete
            </Button>
          </div>
        </div>
      )}

      {/* ── Delete Field Confirm ── */}
      {deleteFieldId !== null && (
        <div className="rounded-xl border border-red-500/30 bg-card p-5 space-y-4 transition-all duration-200 ease-in-out">
        
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold flex items-center gap-2">Delete Field?</h4>
            <p className="text-xs text-muted-foreground">This will remove the field definition and all stored values for this field across all contracts.</p>
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setDeleteFieldId(null)}><X className="w-3.5 h-3.5" /></Button>
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="outline">Cancel</Button>
            <Button className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteField.mutate({ fieldId: deleteFieldId! })}>
              Delete
            </Button>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
