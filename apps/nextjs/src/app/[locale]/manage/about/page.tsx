import Image from "next/image";
import {
  Accordion,
  AccordionControl,
  AccordionItem,
  AccordionPanel,
  Anchor,
  Badge,
  Button,
  Card,
  Center,
  Group,
  Kbd,
  SimpleGrid,
  Stack,
  Table,
  TableTbody,
  TableTd,
  TableTh,
  TableThead,
  TableTr,
  Text,
  ThemeIcon,
  Title,
  UnstyledButton,
} from "@mantine/core";
import { IconBrandPaypal, IconCoffee, IconKeyboard, IconLibrary, IconPackage } from "@tabler/icons-react";

import { capitalize, objectEntries } from "@homarr/common";
import { hotkeys } from "@homarr/definitions";
import { getScopedI18n } from "@homarr/translation/server";

import { muninnLogoPath } from "~/components/layout/logo/muninn-logo";
import { ManagePageLayout } from "~/components/manage/manage-page-layout";
import { createMetaTitle } from "~/metadata";
import { getDependenciesAsync, getPackageVersion } from "~/versions/package-reader";
import classes from "./about.module.css";

export async function generateMetadata() {
  const t = await getScopedI18n("management");

  return {
    title: createMetaTitle(t("metaTitle")),
  };
}

export default async function AboutPage() {
  const t = await getScopedI18n("management.page.about");
  const version = getPackageVersion();
  const dependencies = await getDependenciesAsync();

  const highlights = ["Cobalt UI", "Per-user access control", "Multi-provider SSO", "REST API + docs"];

  return (
    <ManagePageLayout>
      <Center w="100%">
        <Group py="lg">
          <Image src={muninnLogoPath} width={100} height={100} alt="" />
          <Stack gap={0}>
            <Title order={1}>Muninn</Title>
            <Title order={2}>{t("version", { version })}</Title>
          </Stack>
        </Group>
      </Center>

      <Stack gap="md" mb="xl" maw={720} mx="auto">
        <Text ta="center">{t("text")}</Text>
        <Group justify="center" gap="xs">
          {highlights.map((highlight) => (
            <Badge key={highlight} variant="light" radius="sm" size="lg">
              {highlight}
            </Badge>
          ))}
        </Group>
        <Stack gap={2} align="center">
          <Text size="xs" c="dimmed">
            {t("builtOn")}
          </Text>
          <Group gap="xs">
            <Anchor size="xs" c="dimmed" href="https://github.com/Emkraan/muninn" target="_blank">
              Muninn on GitHub
            </Anchor>
            <Text size="xs" c="dimmed">
              ·
            </Text>
            <Anchor size="xs" c="dimmed" href="https://github.com/homarr-labs/homarr" target="_blank">
              Homarr
            </Anchor>
          </Group>
        </Stack>
        <Stack gap={2} align="center">
          <Text size="xs" c="dimmed">
            Free and open source. Support is optional and every feature stays free.
          </Text>
          <Group gap="xs">
            <Button
              component="a"
              href="https://www.buymeacoffee.com/emkraan"
              target="_blank"
              rel="noreferrer"
              size="xs"
              radius="xl"
              leftSection={<IconCoffee size="1rem" />}
              styles={{ root: { backgroundColor: "#FF5F5F", color: "#ffffff" } }}
            >
              Buy Me a Coffee
            </Button>
            <Button
              component="a"
              href="https://www.paypal.com/ncp/payment/Z5LS6SWMFQGU4"
              target="_blank"
              rel="noreferrer"
              size="xs"
              radius="xl"
              leftSection={<IconBrandPaypal size="1rem" />}
              styles={{ root: { backgroundColor: "#00457C", color: "#ffffff" } }}
            >
              PayPal
            </Button>
          </Group>
        </Stack>
      </Stack>

      <Accordion defaultValue="libraries" variant="filled" radius="md">
        <AccordionItem value="libraries">
          <AccordionControl icon={<IconLibrary size="1rem" />}>
            <Stack gap={0}>
              <Text>{t("accordion.libraries.title")}</Text>
              <Text size="sm" c="dimmed">
                {t("accordion.libraries.subtitle", {
                  count: String(Object.keys(dependencies).length),
                })}
              </Text>
            </Stack>
          </AccordionControl>
          <AccordionPanel>
            <SimpleGrid cols={{ xs: 1, sm: 2, md: 3, lg: 4, xl: 5 }} spacing="md">
              {Object.entries(dependencies)
                .filter(([, value]) => !value.includes("workspace:"))
                .toSorted(([key1], [key2]) => key1.localeCompare(key2))
                .map(([name, version]) => (
                  <UnstyledButton
                    key={name}
                    component="a"
                    href={`https://www.npmjs.com/package/${name}`}
                    target="_blank"
                  >
                    <Card radius="md" p="xs" className={classes.dependencyCard}>
                      <Group gap="sm" wrap="nowrap">
                        <ThemeIcon variant="light" size="lg">
                          <IconPackage size="1.5rem" stroke={1.5} />
                        </ThemeIcon>

                        <Stack gap={0}>
                          <Text size="sm" fw="bold" lineClamp={1} title={name}>
                            {name}
                          </Text>
                          <Text size="sm" c="dimmed">
                            v{version.replace("^", "").replace("~", "")}
                          </Text>
                        </Stack>
                      </Group>
                    </Card>
                  </UnstyledButton>
                ))}
            </SimpleGrid>
          </AccordionPanel>
        </AccordionItem>
        <AccordionItem value="hotkeys">
          <AccordionControl icon={<IconKeyboard size="1rem" />}>
            <Stack gap={0}>
              <Text>{t("accordion.hotkeys.title")}</Text>
              <Text size="sm" c="dimmed">
                {t("accordion.hotkeys.subtitle")}
              </Text>
            </Stack>
          </AccordionControl>
          <AccordionPanel>
            <Table>
              <TableThead>
                <TableTr>
                  <TableTh>{t("accordion.hotkeys.field.shortcut")}</TableTh>
                  <TableTh>{t("accordion.hotkeys.field.action")}</TableTh>
                </TableTr>
              </TableThead>
              <TableTbody>
                {objectEntries(hotkeys).map(([key, shortcut]) => (
                  <TableTr key={key}>
                    <TableTd>
                      <Kbd size="md">
                        {shortcut
                          .split("+")
                          .map((key) => capitalize(key.trim()))
                          .join(" + ")}
                      </Kbd>
                    </TableTd>
                    <TableTd>{t(`accordion.hotkeys.action.${key}`)}</TableTd>
                  </TableTr>
                ))}
              </TableTbody>
            </Table>

            <Text size="sm" c="dimmed">
              {t("accordion.hotkeys.note")}
            </Text>
          </AccordionPanel>
        </AccordionItem>
      </Accordion>
    </ManagePageLayout>
  );
}
