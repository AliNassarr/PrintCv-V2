"use client";

import React from "react";
import { useCVStore, normalizeGitHub, normalizeLinkedIn } from "@/lib/store/cv-store";
import { Field } from "@/components/ui/Field";
import { TextInput } from "@/components/ui/TextInput";
import type { CvScore } from "@/lib/cv-score";
import { SectionTitle } from "./parts";

// Your details. Log out and "Update from 42" live in the top bar (the account circle or More), so they are not repeated here.
// The score comes from the layout, so the count matches the score window.
export function ContactSection({ score }: { score: CvScore }) {
  const cvData = useCVStore((s) => s.cvData);
  const setCVData = useCVStore((s) => s.setCVData);
  const updateContact = useCVStore((s) => s.updateContact);

  const details = score.groups.find((g) => g.id === "details")?.checks ?? [];
  const filled = details.filter((c) => c.points >= c.max).length;

  return (
    <div className="flex flex-col gap-6">
      <SectionTitle id="CONTACT" count={`${filled} of ${details.length} details filled.`} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field id="contact-full-name" label="Full name *">
          {(a11y) => (
            <TextInput {...a11y} type="text" required aria-required="true" value={cvData.contact.fullName || ""} placeholder="e.g. Alex Morgan" autoComplete="name"
              onChange={(e) => updateContact({ fullName: e.target.value })} />
          )}
        </Field>
        <Field id="contact-target-role" label="Job you want *">
          {(a11y) => (
            <TextInput {...a11y} type="text" required aria-required="true" value={cvData.targetRole || ""} placeholder="e.g. Software developer"
              onChange={(e) => setCVData({ ...cvData, targetRole: e.target.value })} />
          )}
        </Field>
        <Field id="contact-email" label="Email *">
          {(a11y) => (
            <TextInput {...a11y} type="email" required aria-required="true" value={cvData.contact.email || ""} placeholder="e.g. your.name@gmail.com" autoComplete="email"
              onChange={(e) => updateContact({ email: e.target.value })} />
          )}
        </Field>
        <Field id="contact-phone" label="Phone *">
          {(a11y) => (
            <TextInput {...a11y} type="text" required aria-required="true" value={cvData.contact.phoneNumber || ""} placeholder="e.g. +1 555 123 4567" autoComplete="tel"
              onChange={(e) => updateContact({ phoneNumber: e.target.value })} />
          )}
        </Field>
        <div className="sm:col-span-2">
          <Field id="contact-location" label="City and country">
            {(a11y) => (
              <TextInput {...a11y} type="text" value={cvData.contact.location || ""} placeholder="e.g. Dublin, Ireland"
                onChange={(e) => updateContact({ location: e.target.value })} />
            )}
          </Field>
        </div>
        <Field id="contact-github" label="GitHub">
          {(a11y) => (
            <TextInput {...a11y} type="text" value={cvData.contact.githubUrl || ""} placeholder="github.com/username"
              onChange={(e) => updateContact({ githubUrl: e.target.value })}
              onBlur={(e) => updateContact({ githubUrl: normalizeGitHub(e.target.value) })} />
          )}
        </Field>
        <Field id="contact-linkedin" label="LinkedIn">
          {(a11y) => (
            <TextInput {...a11y} type="text" value={cvData.contact.linkedinUrl || ""} placeholder="linkedin.com/in/username"
              onChange={(e) => updateContact({ linkedinUrl: e.target.value })}
              onBlur={(e) => updateContact({ linkedinUrl: normalizeLinkedIn(e.target.value) })} />
          )}
        </Field>
      </div>
    </div>
  );
}
