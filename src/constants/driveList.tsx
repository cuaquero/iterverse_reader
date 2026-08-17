interface DriveListItem {
  label: string;
  value: string;
  icon: string;
  isPro: boolean;
  support: string[];
  scoped: boolean;
  needExtension?: boolean;
}
export const driveList: DriveListItem[] = [
  {
    label: "Local folder",
    value: "folder",
    icon: "icon-local",
    isPro: false,
    support: ["desktop"],
    scoped: true,
  },
];
interface ConfigItem {
  label: string;
  value: string;
  type: string;
  required?: boolean;
  example?: string;
  note?: string;
}

// Type the driveInputConfig
interface DriveInputConfig {
  [key: string]: ConfigItem[];
}
export const driveInputConfig: DriveInputConfig = {};
