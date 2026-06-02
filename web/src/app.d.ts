import type { Locale } from "$lib/locale/resolve";

declare global {
  namespace App {
    interface Locals {
      locale: Locale;
      // Session is null until §10.2 backend auth verification lands.
      // The access-guard helper short-circuits to /signin when null.
      session: { access_token: string; user_id: string } | null;
    }
    interface PageData {
      locale: Locale;
    }
  }
}

export {};
