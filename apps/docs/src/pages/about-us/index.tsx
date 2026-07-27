import Layout from "@theme/Layout";
import React from "react";
import Link from "@docusaurus/Link";
import { CodeContributorList } from "@site/src/components/pages/about/code-contributors/code-contributor-list";
import { TranslationContributorList } from "@site/src/components/pages/about/translations-contributors/translation-constributor-list";

export default function AboutUs() {
  return (
    <Layout
      title="About Muninn"
      description={
        "Muninn is an open source dashboard, forked from Homarr and maintained by Emkraan. The people listed here built the project Muninn is based on."
      }
    >
      <main className="mx-auto w-full md:w-2/3 ps-10 pr-10 mb-20 mt-10">
        <h1 className="text-5xl font-extrabold">About us</h1>
        <p className="text-lg text-gray-500">
          Muninn is an open source dashboard maintained by Emkraan. It is a fork of{" "}
          <Link to="https://github.com/homarr-labs/homarr">Homarr</Link>, based on Homarr v1.71.0 and licensed under
          Apache 2.0. Almost everything Muninn can do, it can do because the Homarr community built it first.
        </p>

        {/* These two lists are fetched from Homarr's repositories, not Muninn's. They
            are the people who wrote the code and the translations this fork inherited,
            and they are credited as such rather than presented as Muninn's own team. */}
        <h2 className={"mt-10"}>Homarr code contributors</h2>

        <p className="text-gray-500">
          The people who wrote the project Muninn is built on. Muninn is not affiliated with Homarr, and these
          contributors are not responsible for this fork.
        </p>

        <CodeContributorList />

        <h2 className={"mt-10"}>Homarr translation contributors</h2>

        <p className="text-gray-500">Muninn ships in many languages thanks to the people who translated Homarr.</p>

        <TranslationContributorList />
      </main>
    </Layout>
  );
}
