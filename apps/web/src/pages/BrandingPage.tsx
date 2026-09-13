import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "../components/Page";
import { useBranding } from "../lib/branding-context";

export function BrandingPage() {
  const { branding, updateBranding, resetBranding }=useBranding(); const [saved,setSaved]=useState(false);
  function submit(event: FormEvent<HTMLFormElement>){event.preventDefault();const data=new FormData(event.currentTarget);updateBranding({displayName:String(data.get("displayName")),primaryColor:String(data.get("primaryColor")),secondaryColor:String(data.get("secondaryColor"))});setSaved(true);window.setTimeout(()=>setSaved(false),1200)}
  return <><PageHeader eyebrow="Organization settings" title="Branding" description="Apply your organization’s identity after users sign in."/>
    <div className="branding-grid"><Card className="surface branding-form"><form onSubmit={submit}><div className="section-heading"><div><p className="page-eyebrow">Theme</p><h2>Organization identity</h2></div></div><Field><FieldLabel>Display name</FieldLabel><Input name="displayName" defaultValue={branding.displayName} required/></Field><div className="color-grid"><Field><FieldLabel>Primary colour</FieldLabel><div className="color-input"><input name="primaryColor" type="color" defaultValue={branding.primaryColor}/><span>{branding.primaryColor}</span></div></Field><Field><FieldLabel>Secondary colour</FieldLabel><div className="color-input"><input name="secondaryColor" type="color" defaultValue={branding.secondaryColor}/><span>{branding.secondaryColor}</span></div></Field></div><Field><FieldLabel>Organization logo</FieldLabel><div className="upload-area"><strong>Upload a PNG or SVG</strong><FieldDescription>Maximum 2 MB. A square or horizontal transparent logo works best.</FieldDescription><input type="file" accept="image/png,image/svg+xml"/></div></Field><div className="form-actions spread"><Button type="button" variant="outline" onPress={resetBranding}>Reset</Button><Button type="submit">{saved ? "Saved" : "Save branding"}</Button></div></form></Card>
      <Card className="surface preview-panel"><p className="page-eyebrow">Live preview</p><div className="brand-preview"><div className="preview-sidebar"><div className="brand-logo">N</div><strong>{branding.displayName}</strong><span/><span/><span/></div><div className="preview-content"><div className="preview-header"/><div className="preview-heading"/><div className="preview-cards"><i/><i/><i/></div><Button size="sm">Primary action</Button></div></div><p className="muted">On shared sign-in URLs, NIQ branding is shown until the organization is identified.</p></Card>
    </div></>;
}
