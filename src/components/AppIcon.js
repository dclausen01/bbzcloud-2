import React, { useState, useEffect } from 'react';
import { Image } from '@chakra-ui/react';

function AppIcon({ id, size = "28px" }) {
  const [iconPath, setIconPath] = useState('');

  // Map app IDs to their corresponding SVG files
  const getIconPath = (id) => {
    const iconMap = {
      schulcloud: 'schulcloud.svg',
      moodle: 'moodle.svg',
      bbb: 'bigbluebutton.svg',
      outlook: 'outlook.svg',
      office: 'office.svg',
      cryptpad: 'cryptpad.svg',
      taskcards: 'taskcards.svg',
      webuntis: 'untis.svg',
      wiki: 'wiki.svg',
      handbook: 'handbook.svg',
      fobizz: 'fobizztools.svg'
    };

    return `icons/${iconMap[id] || 'link.svg'}`;
  };

  useEffect(() => {
    const loadIcon = async () => {
      try {
        const path = await window.electron.getAssetPath(getIconPath(id));
        setIconPath(path);
      } catch (error) {
        console.error('Error loading icon:', error);
      }
    };
    loadIcon();
  }, [id]);

  return (
    <Image
      src={iconPath ? `file://${iconPath}` : ''}
      alt={`${id} icon`}
      height={size}
      width={size}
      objectFit="contain"
    />
  );
}

export default AppIcon;
