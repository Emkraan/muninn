import { useEffect, useState } from "react";
import useBaseUrl from "@docusaurus/useBaseUrl";

type Contributor = {
  username: string;
  avatarUrl: string;
};

export const TranslationContributorList = () => {
  const [contributors, setContributors] = useState<Contributor[]>([]);
  const dataUrl = useBaseUrl("/data/translation-contributions.json");

  useEffect(() => {
    fetch(dataUrl).then(async (response) => {
      const data = await response.json();
      setContributors(data);
    });
  }, [dataUrl]);

  return (
    <div className={"flex flex-wrap gap-3 argos-ignore"}>
      {contributors.map((contributor: Contributor) => (
        <div className={"flex flex-col items-center w-24"}>
          <img className={"w-24 h-24 aspect-square rounded mb-2"} src={contributor.avatarUrl} alt={""} />
          <h6 className={"truncate text-nowrap max-w-full"}>{contributor.username}</h6>
        </div>
      ))}
    </div>
  );
};
