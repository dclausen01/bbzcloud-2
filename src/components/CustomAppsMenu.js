import React, { useRef } from 'react';
import { Button } from '@chakra-ui/react';

function CustomAppsMenu({ apps, standardApps }) {
  const triggerRef = useRef(null);

  const hasStandardApps = standardApps && standardApps.length > 0;
  const hasCustomApps = apps && apps.length > 0;
  const hasAnyApps = hasStandardApps || hasCustomApps;

  if (!hasAnyApps) {
    return (
      <Button
        variant="ghost"
        size="sm"
        opacity={0.6}
        cursor="default"
        _hover={{ bg: 'transparent' }}
        height="28px"
      >
        Apps
      </Button>
    );
  }

  const handleOpen = () => {
    if (!window.electron?.overlay) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    window.electron.overlay.open({
      surface: 'customAppsMenu',
      triggerRect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
      apps: apps || [],
      standardApps: standardApps || [],
    });
  };

  return (
    <Button
      ref={triggerRef}
      rightIcon={<span>▼</span>}
      variant="outline"
      size="sm"
      height="28px"
      minW="auto"
      px={3}
      fontSize="xs"
      onClick={handleOpen}
    >
      Apps
    </Button>
  );
}

export default CustomAppsMenu;
