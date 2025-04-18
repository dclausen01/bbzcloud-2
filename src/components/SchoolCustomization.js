import React from 'react';

// Default configuration for BBZ Rendsburg-Eckernförde
const defaultSchoolConfig = {
  // School information
  schoolInfo: {
    name: 'BBZ Rendsburg-Eckernförde',
    shortName: 'BBZ RD-ECK',
    domain: 'bbz-rd-eck.de',
    logo: 'logo.png',
    website: 'https://www.bbz-rd-eck.de',
  },
  
  // Navigation buttons configuration
  navigationButtons: {
    schulcloud: { 
      visible: true, 
      url: 'https://app.schul.cloud', 
      title: 'schul.cloud',
      buttonVariant: 'schulcloud',
      zoom: 1.0
    },
    moodle: { 
      visible: true, 
      url: 'https://portal.bbz-rd-eck.com', 
      title: 'Moodle',
      buttonVariant: 'moodle',
      zoom: 1.0
    },
    bbb: { 
      visible: true, 
      url: 'https://bbb.bbz-rd-eck.de/b/signin', 
      title: 'BigBlueButton',
      buttonVariant: 'bbb',
      zoom: 1.0
    },
    outlook: {
      visible: true,
      url: 'https://exchange.bbz-rd-eck.de/owa/#path=/mail',
      title: 'Outlook',
      buttonVariant: 'blue',
      zoom: 1.0
    },
    office: {
      visible: true,
      url: 'https://m365.cloud.microsoft/?auth=2',
      title: 'Office',
      buttonVariant: 'lilac',
      zoom: 1.0
    },
    cryptpad: {
      visible: true,
      url: 'https://cryptpad.fr/drive',
      title: 'CryptPad',
      buttonVariant: 'cryptpad',
      zoom: 1.0
    },
    taskcards: {
      visible: true,
      url: 'https://bbzrdeck.taskcards.app',
      title: 'TaskCards',
      buttonVariant: 'taskcards',
      zoom: 1.0
    },
    webuntis: {
      visible: true,
      url: 'https://neilo.webuntis.com/WebUntis/?school=bbz-rd-eck#/basic/login',
      title: 'WebUntis',
      buttonVariant: 'orange',
      zoom: 1.0
    },
    fobizz: {
      visible: true,
      url: 'https://tools.fobizz.com/',
      title: 'Fobizz Tools',
      buttonVariant: 'darkred',
      zoom: 1.0
    },
    wiki: {
      visible: true,
      url: 'https://wiki.bbz-rd-eck.com',
      title: 'Intranet',
      buttonVariant: 'wiki',
      zoom: 1.0
    },
    handbook: {
      visible: true,
      url: 'https://viflow.bbz-rd-eck.de/viflow/',
      title: 'Handbuch',
      buttonVariant: 'handbook',
      zoom: 1.0
    }
  },
  
  // Standard apps configuration
  standardApps: {
    "SchulSHPortal": {
      "id": "SchulSHPortal",
      "title": "Schul.SH Portal",
      "url": "https://portal.schule-sh.de/",
      "buttonVariant": "solid"
    },
    "Hubbs": {
      "id": "Hubbs",
      "title": "Hubbs",
      "url": "https://hubbs.schule/",
      "buttonVariant": "solid"
    },
    "BiBox": {
      "id": "BiBox",
      "title": "BiBox",
      "url": "https://bibox2.westermann.de/",
      "buttonVariant": "solid"
    },
    "RAABits": {
      "id": "RAABits",
      "title": "RAABits",
      "url": "https://www.raabits.de/",
      "buttonVariant": "solid"
    },
    "OneNote": {
      "id": "OneNote",
      "title": "OneNote",
      "url": "https://www.onenote.com/notebooks?auth=2&nf=1",
      "buttonVariant": "solid"
    },
    "Oncoo": {
      "id": "Oncoo",
      "title": "Oncoo",
      "url": "https://www.oncoo.de/",
      "buttonVariant": "solid"
    },
    "Miro": {
      "id": "Miro",
      "title": "Miro",
      "url": "https://miro.com/app/dashboard/",
      "buttonVariant": "solid"
    },
    "Digiscreen": {
      "id": "Digiscreen",
      "title": "Digiscreen",
      "url": "https://ladigitale.dev/digiscreen/",
      "buttonVariant": "solid"
    },
    "ClassroomScreen": {
      "id": "ClassroomScreen",
      "title": "ClassroomScreen",
      "url": "https://classroomscreen.com/app/screen/",
      "buttonVariant": "solid"
    },
    "PlagScan": {
      "id": "PlagScan",
      "title": "PlagScan",
      "url": "https://my.plagaware.com/dashboard",
      "buttonVariant": "solid"
    },
    "ExcaliDraw": {
      "id": "ExcaliDraw",
      "title": "ExcaliDraw",
      "url": "https://excalidraw.com/",
      "buttonVariant": "solid"
    },
    "KurzeLinks": {
      "id": "KurzeLinks",
      "title": "Kurze Links",
      "url": "https://kurzelinks.de",
      "buttonVariant": "solid"
    }
  },
  
  // Login systems configuration
  loginSystems: {
    moodle: {
      enabled: true,
      loginSelector: 'input[name="username"][id="username"]',
      passwordSelector: 'input[name="password"][id="password"]',
      submitSelector: 'button[type="submit"][id="loginbtn"]',
      useLowerCase: true,
    },
    bbb: {
      enabled: true,
      loginSelector: '#session_email',
      passwordSelector: '#session_password',
      submitSelector: '.signin-button',
      useSpecialPassword: true, // Uses bbbPassword instead of regular password
    },
    webuntis: {
      enabled: true,
      useReactLogin: true, // Special handling for React-based login forms
      useSpecialCredentials: true, // Uses webuntisEmail and webuntisPassword
    },
    outlook: {
      enabled: true,
      loginSelector: '#userNameInput',
      passwordSelector: '#passwordInput',
      submitSelector: '#submitButton',
      reloadAfterLogin: true,
      reloadDelay: 5000,
    },
    handbook: {
      enabled: true,
      loginSelector: '#userNameInput',
      passwordSelector: '#passwordInput',
      submitSelector: '#submitButton',
      waitForFormTimeout: 5000,
      reloadAfterLogin: true,
      reloadDelay: 5000,
    },
  },
  
  // Theme customization
  theme: {
    primaryColor: '#2196f3', // Brand blue
    colors: {
      schulcloud: '#ffc107',
      moodle: '#ff5722',
      bbb: '#3f51b5',
      wiki: '#03a9f4',
      handbook: '#4caf50',
      taskcards: '#00bcd4',
      cryptpad: '#0097a4',
      lilac: '#9c27b0',
      blue: '#2196f3',
      orange: '#ff9800',
      darkred: '#b71c1c',
    },
  },
  
  // User role configuration
  userRoles: {
    teacher: {
      domainPattern: '@bbz-rd-eck.de',
      allowedApps: 'all',
    },
    student: {
      domainPattern: '@sus.bbz-rd-eck.de',
      allowedApps: ['schulcloud', 'moodle', 'office', 'cryptpad', 'webuntis', 'wiki'],
    },
  },
};

export const SchoolCustomization = React.createContext(defaultSchoolConfig);

export function useSchoolCustomization() {
  return React.useContext(SchoolCustomization);
}

export function SchoolCustomizationProvider({ children, customConfig = {} }) {
  // Merge default config with any custom overrides
  const mergedConfig = React.useMemo(() => {
    return {
      ...defaultSchoolConfig,
      ...customConfig,
      // Deep merge for nested objects
      schoolInfo: {
        ...defaultSchoolConfig.schoolInfo,
        ...customConfig.schoolInfo,
      },
      navigationButtons: {
        ...defaultSchoolConfig.navigationButtons,
        ...customConfig.navigationButtons,
      },
      standardApps: {
        ...defaultSchoolConfig.standardApps,
        ...customConfig.standardApps,
      },
      loginSystems: {
        ...defaultSchoolConfig.loginSystems,
        ...customConfig.loginSystems,
      },
      theme: {
        ...defaultSchoolConfig.theme,
        ...customConfig.theme,
        colors: {
          ...defaultSchoolConfig.theme.colors,
          ...customConfig.theme?.colors,
        },
      },
      userRoles: {
        ...defaultSchoolConfig.userRoles,
        ...customConfig.userRoles,
      },
    };
  }, [customConfig]);

  return (
    <SchoolCustomization.Provider value={mergedConfig}>
      {children}
    </SchoolCustomization.Provider>
  );
}

// Export the default config for use in other files
export { defaultSchoolConfig };
