import Navbar from "@/components/Navbar";
import Announcement from "@/components/Announcement";
import Sidebar from "@/components/Sidebar";
import { ReactNode, useEffect, useState } from "react";
import getLatestVersion from "@/lib/client/getLatestVersion";
import DragNDrop from "@/components/DragNDrop";
import { LinkIncludingShortenedCollectionAndTags } from "@linkwarden/types/global";

interface Props {
  children: ReactNode;
}

export default function MainLayout({ children }: Props) {
  const showAnnouncementBar = localStorage.getItem("showAnnouncementBar");
  const sidebarState = localStorage.getItem("sidebarIsCollapsed");

  const [showAnnouncement, setShowAnnouncement] = useState(
    showAnnouncementBar ? showAnnouncementBar === "true" : true
  );
  const [sidebarIsCollapsed, setSidebarIsCollapsed] = useState(
    sidebarState ? sidebarState === "true" : false
  );

  useEffect(() => {
    getLatestVersion(setShowAnnouncement);
  }, []);

  useEffect(() => {
    localStorage.setItem(
      "showAnnouncementBar",
      showAnnouncement ? "true" : "false"
    );
  }, [showAnnouncement]);

  useEffect(() => {
    localStorage.setItem(
      "sidebarIsCollapsed",
      sidebarIsCollapsed ? "true" : "false"
    );
  }, [sidebarIsCollapsed]);

  const toggleAnnouncementBar = () => setShowAnnouncement(!showAnnouncement);
  const toggleSidebar = () => setSidebarIsCollapsed(!sidebarIsCollapsed);

  const [activeLink, setActiveLink] =
    useState<LinkIncludingShortenedCollectionAndTags | null>(null);

  return (
    <DragNDrop activeLink={activeLink} setActiveLink={setActiveLink}>
      <div className="flex" data-testid="dashboard-wrapper">
        {showAnnouncement && (
          <Announcement toggleAnnouncementBar={toggleAnnouncementBar} />
        )}
        <div className="hidden lg:block">
          <Sidebar
            className={`${sidebarIsCollapsed ? "w-14" : "w-80"}`}
            toggleSidebar={toggleSidebar}
            sidebarIsCollapsed={sidebarIsCollapsed}
          />
        </div>

        <div
          className={`${
            sidebarIsCollapsed
              ? "lg:w-[calc(100%-56px)]"
              : "lg:w-[calc(100%-320px)]"
          } w-full sm:pb-0 pb-20 flex flex-col h-screen overflow-y-auto`}
        >
          <Navbar />
          {children}
        </div>
      </div>
      {/* Mandatory Emkraan brand tag (web-ui-standard). UI-only; does not affect
          commit authorship. */}
      <a
        className="emkraan-tag"
        href="https://github.com/Emkraan/muninn"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Built by Emkraan"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="emkraan-mark"
          src="/brand/emkraan.png"
          alt=""
          width={18}
          height={18}
        />
        <span className="emkraan-text">
          Built by <b>Emkraan</b>
        </span>
      </a>
    </DragNDrop>
  );
}
