import { groupProfiles, profileOptionText, type GroupableProfile } from "@utils/profileGroups";

export interface ProfileOptionsProps<T extends GroupableProfile> {
  profiles: readonly T[];
  text?: (profile: T) => string;
}

export const ProfileOptions = <T extends GroupableProfile>({ profiles, text = profileOptionText }: ProfileOptionsProps<T>) => (
  <>
    {groupProfiles(profiles).map((group) => (
      <optgroup key={group.key} label={group.label} data-so="profile-group" data-locality={group.locality}>
        {group.profiles.map((profile) => <option key={profile.id} value={profile.id}>{text(profile)}</option>)}
      </optgroup>
    ))}
  </>
);
