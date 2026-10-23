import { TimersFixture } from "./timers";
import { createRoot } from "react-dom/client";
import { AdminRecipes } from "../../../src/features/admin/admin-recipes";
import { CatalogueMaintenance } from "../../../src/features/admin/catalogue-maintenance";
createRoot(document.getElementById("root")!).render(
  new URLSearchParams(location.search).get("screen") === "timers" ? (
    <TimersFixture />
  ) : new URLSearchParams(location.search).get("screen") === "catalogue" ? (
    <CatalogueMaintenance />
  ) : (
    <AdminRecipes />
  ),
);
