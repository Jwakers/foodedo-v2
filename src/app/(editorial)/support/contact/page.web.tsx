import {
  PublicPage,
  publicPageMetadata,
} from "@/features/public-pages/public-page";
import { ContactFormWithAccount } from "@/features/contact/contact-form-with-account";

export const dynamic = "force-static";
export const metadata = publicPageMetadata("/support/contact");

export default function ContactPage() {
  const configuredId = process.env.FORMSPREE_FORM_ID?.trim();
  const formId =
    configuredId && /^[a-zA-Z0-9]+$/.test(configuredId)
      ? configuredId
      : undefined;
  return (
    <PublicPage path="/support/contact">
      <ContactFormWithAccount formId={formId} />
    </PublicPage>
  );
}
