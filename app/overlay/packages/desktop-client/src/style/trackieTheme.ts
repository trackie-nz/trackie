/**
 * Change the default theme to be Butterfly theme, from
 * https://github.com/samekh248/actual-butterfly-theme
 *
 * Users can change this back to any theme they prefer.
 */
export const TRACKIE_THEME_CSS = `:root {
  /* --- SANDSTONE FOUNDATION --- */
  --color-pageBackground: #F9F7F2; 
  --color-pageBackgroundTopLeft: #F9F7F2;
  --color-pageBackgroundBottomRight: #F4F1E9;
  --color-pageBackgroundLineTop: #FFFFFF;
  --color-pageBackgroundLineMid: #F9F7F2;
  --color-pageBackgroundLineBottom: #EDE7DE;
  --color-pageBackgroundModalActive: rgba(34, 32, 29, 0.2);
  --color-overlayBackground: rgba(0, 0, 0, 0.3);
  --color-sidebarBackground: #F4F1E9; 
  
  /* --- TYPOGRAPHY --- */
  --color-pageText: #22201D;
  --color-pageTextLight: #726E66;
  --color-pageTextSubdued: #9E9990;
  --color-pageTextDark: #12110F;
  --color-pageTextPositive: #16A34A; 
  --color-pageTextNegative: #E16259;
  --color-pageTextLink: #F35B16;
  --color-pageTextLinkLight: #FF7D45;

  /* --- NUMBERS --- */
  --color-numberPositive: #16A34A;
  --color-numberNegative: #E16259;
  --color-numberNeutral: #726E66;

  /* --- CARDS & MODALS --- */
  --color-cardBackground: #FFFEFC;
  --color-cardBorder: #EDE7DE;
  --color-cardShadow: rgba(60, 50, 30, 0.08);
  --color-modalBackground: #F4F1E9;
  --color-modalBorder: #DED8CE;

  /* --- TABLES & BUDGET GRID --- */
  --color-tableBackground: #FFFEFC;
  --color-tableRowBackgroundHover: #F7F3EB;
  --color-tableRowBackgroundHighlight: #FFF1EA;
  --color-tableRowBackgroundHighlightText: #22201D;
  --color-tableText: #22201D;
  --color-tableTextLight: #726E66;
  --color-tableTextSubdued: #9E9990;
  --color-tableTextSelected: #F35B16;
  --color-tableTextHover: #22201D;
  --color-tableTextInactive: #9E9990;
  --color-tableHeaderText: #4B5563;
  --color-tableHeaderBackground: #F1ECE3;
  --color-tableRowHeaderBackground: #F1ECE3;
  --color-tableRowHeaderText: #22201D;
  --color-tableBorder: #EDE7DE;
  --color-tableBorderSelected: #F35B16;
  --color-tableBorderHover: #F35B16;
  --color-tableBorderSeparator: #DED8CE;
  
  --color-budgetCurrentMonth: #FFFEFC;
  --color-budgetOtherMonth: #FDFBFA;           /* Extremely subtle contrast */
  --color-budgetHeaderCurrentMonth: #F1ECE3;
  --color-budgetHeaderOtherMonth: #F1ECE3;
  --color-budgetNumberZero: #9E9990;
  --color-budgetNumberNegative: #E16259;
  --color-budgetNumberNeutral: #22201D;
  --color-budgetNumberPositive: #16A34A;
  --color-toBudgetPositive: #16A34A;
  --color-toBudgetZero: #16A34A;
  --color-toBudgetNegative: #E16259;
  --color-templateNumberFunded: #16A34A;
  --color-templateNumberUnderFunded: #D84E12;

  /* --- SIDEBAR --- */
  --color-sidebarBudgetName: #22201D;
  --color-sidebarItemText: #22201D;
  --color-sidebarItemTextSelected: #F35B16;
  --color-sidebarItemBackgroundHover: #EDE7DE;
  --color-sidebarItemBackgroundSelected: #FFFEFC;
  --color-sidebarItemAccentSelected: #F35B16;
  --color-sidebarItemBackgroundPending: #F1ECE3;
  --color-sidebarItemBackgroundPositive: #DCFCE7;
  --color-sidebarItemBackgroundFailed: #FCE8E6;

  /* --- MENUS & DROPDOWNS --- */
  --color-menuBackground: #FFFBF7;           
  --color-menuItemBackground: #FFFBF7;
  --color-menuItemBackgroundHover: #F1ECE3; 
  --color-menuItemText: #22201D;           
  --color-menuItemTextHover: #22201D;      
  --color-menuItemTextSelected: #F35B16;
  --color-menuItemTextHeader: #22201D;     
  --color-menuBorder: #22201D;             
  --color-menuBorderHover: #F35B16;
  --color-menuKeybindingText: #726E66;
  
  --color-menuAutoCompleteBackground: #FFFBF7;
  --color-menuAutoCompleteBackgroundHover: #F1ECE3;
  --color-menuAutoCompleteText: #22201D;
  --color-menuAutoCompleteItemText: #22201D;
  --color-menuAutoCompleteItemTextHover: #F35B16; 
  --color-menuAutoCompleteTextHeader: #22201D;
  --color-menuAutoCompleteTextHover: #F35B16;

  /* --- FORMS & INPUTS --- */
  --color-formLabelText: #F35B16;
  --color-formLabelBackground: #FFF1EA;
  --color-formInputBackground: #FFFEFC;
  --color-formInputBackgroundSelected: #FFF1EA;
  --color-formInputBackgroundSelection: #F35B16;
  --color-formInputText: #22201D;
  --color-formInputTextSelected: #FFFFFF;
  --color-formInputTextPlaceholder: #9E9990;
  --color-formInputTextPlaceholderSelected: #726E66;
  --color-formInputTextSelection: #EDE7DE;
  --color-formInputTextReadOnlySelection: #F9F7F2;
  --color-formInputBorder: #DED8CE;
  --color-formInputBorderSelected: #F35B16;
  --color-formInputShadowSelected: rgba(243, 91, 22, 0.4);
  --color-formInputTextHighlight: #F35B16;
  
  /* --- CHECKBOXES --- */
  --color-checkboxText: #22201D;
  --color-checkboxBackgroundSelected: #F35B16;
  --color-checkboxBorderSelected: #F35B16;
  --color-checkboxShadowSelected: rgba(243, 91, 22, 0.2);
  --color-checkboxToggleBackground: #DED8CE;
  --color-checkboxToggleBackgroundSelected: #F35B16;
  --color-checkboxToggleDisabled: #EDE7DE;

  /* --- BUTTONS --- */
  --color-buttonPrimaryBackground: #F35B16;
  --color-buttonPrimaryBackgroundHover: #D84E12;
  --color-buttonPrimaryText: #FFFFFF;
  --color-buttonPrimaryTextHover: #FFFFFF;
  --color-buttonPrimaryBorder: #D84E12;
  --color-buttonPrimaryShadow: rgba(60, 50, 30, 0.15);
  --color-buttonPrimaryDisabledBackground: #EDE7DE;
  --color-buttonPrimaryDisabledBorder: #DED8CE;
  --color-buttonPrimaryDisabledText: #9E9990;
  
  --color-buttonNormalBackground: #F1ECE3;
  --color-buttonNormalBackgroundHover: #EDE7DE;
  --color-buttonNormalText: #22201D;
  --color-buttonNormalTextHover: #12110F;
  --color-buttonNormalBorder: #DED8CE;
  --color-buttonNormalDisabledBackground: #F9F7F2;
  --color-buttonNormalDisabledBorder: #EDE7DE;
  --color-buttonNormalDisabledText: #9E9990;
  --color-buttonNormalSelectedBackground: #F1ECE3;
  --color-buttonNormalSelectedText: #F35B16;
  --color-buttonNormalShadow: rgba(0, 0, 0, 0.05);

  --color-buttonBareBackground: transparent;
  --color-buttonBareBackgroundHover: rgba(243, 91, 22, 0.1);
  --color-buttonBareBackgroundActive: rgba(243, 91, 22, 0.2);
  --color-buttonBareText: #22201D; 
  --color-buttonBareTextHover: #F35B16;
  --color-buttonBareDisabledBackground: transparent;
  --color-buttonBareDisabledText: #9E9990;

  --color-buttonMenuBackground: #F35B16;
  --color-buttonMenuBackgroundHover: #D84E12;
  --color-buttonMenuBorder: #D84E12;
  --color-buttonMenuText: #FFFFFF;
  --color-buttonMenuTextHover: #FFFFFF;
  --color-buttonMenuSelectedBackground: #D84E12;
  --color-buttonMenuSelectedBackgroundHover: #BD420F;
  --color-buttonMenuSelectedBorder: #BD420F;
  --color-buttonMenuSelectedText: #FFFFFF;

  /* --- CALENDAR --- */
  --color-calendarBackground: #4D453E;         
  --color-calendarCellBackground: #5C534B;
  --color-calendarItemBackground: #4D453E;
  --color-calendarItemText: #F9F7F2;          
  --color-calendarText: #F9F7F2;
  --color-calendarSelectedBackground: #F35B16; 
  --color-calendarItemBackgroundSelected: #F35B16;
  --color-calendarItemHover: #6E635A;
  --color-calendarItemTextSelected: #FFFFFF;
  --color-calendarItemToday: #F35B16;
  --color-calendarItemTextToday: #F35B16;

  /* --- NOTICES & WARNINGS --- */
  --color-noticeBackground: #D1FAE5;
  --color-noticeBackgroundLight: #ECFDF5;
  --color-noticeBackgroundDark: #16A34A;
  --color-noticeText: #16A34A;      
  --color-noticeTextLight: #16A34A;
  --color-noticeTextDark: #16A34A;   
  --color-noticeTextMenu: #16A34A;
  --color-noticeBorder: #16A34A;
  
  --color-warningBackground: #FFF1EA;
  --color-warningText: #3D261C;
  --color-warningTextLight: #D84E12;
  --color-warningTextDark: #3D261C;
  --color-warningBorder: #F35B16;
  --color-errorBackground: #FCE8E6;
  --color-errorText: #E16259;
  --color-errorTextDark: #B91C1C;
  --color-errorTextDarker: #7F1D1D;
  --color-errorTextMenu: #E16259;
  --color-errorBorder: #E16259;
  --color-upcomingBackground: #F1ECE3;
  --color-upcomingBorder: #F35B16;
  --color-upcomingText: #3D261C;

  /* --- PILLS & TAGS --- */
  --color-pillBackground: #EAE5DB;
  --color-pillBackgroundLight: #F9F7F2;
  --color-pillBackgroundSelected: #F1E6D8;
  --color-pillText: #726E66;
  --color-pillTextHighlighted: #F35B16;
  --color-pillTextSelected: #F35B16; 
  --color-pillTextSubdued: #9E9990;
  --color-pillBorder: #DED8CE;
  --color-pillBorderDark: #9E9990;
  --color-pillBorderSelected: #F35B16;

  /* --- NOTE TAGS --- */
  --color-noteTagBackground: #EAE5DB;      
  --color-noteTagBackgroundHover: #DED8CE; 
  --color-noteTagDefault: #EAE5DB;
  --color-noteTagText: #22201D;           

  /* --- MOBILE --- */
  --color-mobileHeaderBackground: #F35B16;
  --color-mobileHeaderText: #FFFFFF;
  --color-mobileHeaderTextHover: rgba(255, 255, 255, 0.15);
  --color-mobileHeaderTextSubdued: #EDE7DE;
  --color-mobilePageBackground: #F9F7F2;
  --color-mobileNavBackground: #FFFEFC;
  --color-mobileNavItem: #8B867E;
  --color-mobileNavText: #8B867E;
  --color-mobileNavTextSelected: #FFFFFF;
  --color-mobileNavItemSelected: #F35B16;
  --color-mobileAccountShadow: rgba(60, 50, 30, 0.12);
  --color-mobileAccountText: #F35B16;
  --color-mobileTransactionSelected: #F35B16;
  --color-mobileViewTheme: #F35B16;
  --color-mobileConfigServerViewTheme: #F35B16;

  /* --- REPORTS & CHARTS --- */
  --color-reportsRed: #E16259;
  --color-reportsBlue: #40a5f7;
  --color-reportsGreen: #22C55E;
  --color-reportsGray: #9E9990;
  --color-reportsLabel: #726E66;
  --color-reportsInnerLabel: #22201D;
  --color-reportsNumberPositive: #16A34A;
  --color-reportsNumberNegative: #E16259;
  --color-reportsNumberNeutral: #726E66;
  --color-reportsChartFill: #22C55E;

  /* --- ACTION BAR & TOOLTIPS --- */
  --color-floatingActionBarBackground: #F4F1E9;
  --color-floatingActionBarBorder: #F35B16;
  --color-floatingActionBarText: #22201D;
  --color-tooltipBackground: #FFFBF7;      
  --color-tooltipText: #22201D;
  --color-tooltipBorder: #DED8CE;
  
  /* --- MARKDOWN --- */
  --color-markdownNormal: #22201D;
  --color-markdownDark: #12110F;
  --color-markdownLight: #726E66;
}`;
