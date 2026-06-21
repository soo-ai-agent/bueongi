import { createBrowserRouter } from "react-router";
import { Layout } from "./components/Layout";
import { RouteErrorBoundary } from "./components/RouteErrorBoundary";
import { Onboarding } from "./pages/Onboarding";
import { Home } from "./pages/Home";
import { RouteComparison } from "./pages/RouteComparison";
import { RouteDetail } from "./pages/RouteDetail";
import { NavigationScreen } from "./pages/Navigation";
import { ShareStatus } from "./pages/ShareStatus";
import { GuardianShare } from "./pages/GuardianShare";
import { MyPage } from "./pages/MyPage";
import { PlaceSearch } from "./pages/PlaceSearch";
import { ConfirmLocation } from "./pages/ConfirmLocation";
import { EmergencyContact } from "./pages/EmergencyContact";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    errorElement: <RouteErrorBoundary />,
    children: [
      { index: true, Component: Onboarding },
      { path: "home", Component: Home },
      { path: "search", Component: RouteComparison },
      { path: "place-search", Component: PlaceSearch },
      { path: "confirm-location", Component: ConfirmLocation },
      { path: "route/:id", Component: RouteDetail },
      { path: "navigate", Component: NavigationScreen },
      { path: "share", Component: ShareStatus },
      // 보호자 공유 페이지: 로그인 없이 URL(/share/{token})만으로 접근, 5초 폴링.
      { path: "share/:token", Component: GuardianShare },
      { path: "mypage", Component: MyPage },
      { path: "emergency-contacts", Component: EmergencyContact },
    ],
  },
]);
