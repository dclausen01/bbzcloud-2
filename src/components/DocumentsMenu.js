import React, { useRef } from 'react';
import { Button, HStack, Badge } from '@chakra-ui/react';

function DocumentsMenu({ reminderCount = 0 }) {
  const triggerRef = useRef(null);

  const handleOpen = () => {
    if (!window.electron?.overlay) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    window.electron.overlay.open({
      surface: 'documentsMenu',
      triggerRect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
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
      <HStack spacing={1}>
        <span>📝</span>
        {reminderCount > 0 && (
          <Badge
            colorScheme="purple"
            variant="solid"
            borderRadius="full"
            fontSize="0.6em"
            minW="1.6em"
            textAlign="center"
          >
            {reminderCount}
          </Badge>
        )}
      </HStack>
    </Button>
  );
}

export default DocumentsMenu;
