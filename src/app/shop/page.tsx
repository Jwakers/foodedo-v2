import { Suspense } from "react";

import {
  ShoppingListPage,
  ShoppingListPageFallback,
} from "@/features/shop/shopping-list-page";

export default function ShopPage() {
  return (
    <Suspense fallback={<ShoppingListPageFallback />}>
      <ShoppingListPage />
    </Suspense>
  );
}
