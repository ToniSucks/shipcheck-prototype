import type { Page } from 'playwright';
import type { Issue } from './types';
export type Finding = Omit<Issue, 'id' | 'pageUrl' | 'viewport'>;
export interface PageChecker {
  name: string;
  check(page: Page): Promise<Finding[]>;
}
export const mobileOverflow: PageChecker = {
  name: 'mobile-overflow',
  async check(page) {
    const dimensions = await page.evaluate(() => {
      const viewportWidth = document.documentElement.clientWidth;
      const documentWidth = Math.max(
        document.documentElement.scrollWidth,
        document.body?.scrollWidth ?? 0,
      );
      const elements = [...document.querySelectorAll('body *')]
        .slice(0, 10000)
        .filter((el) => el.getBoundingClientRect().right > viewportWidth + 2)
        .slice(0, 5)
        .map(
          (el) =>
            `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.classList.length ? '.' + [...el.classList].slice(0, 2).join('.') : ''}`,
        );
      return { viewportWidth, documentWidth, elements };
    });
    return dimensions.documentWidth > dimensions.viewportWidth + 2
      ? [
          {
            type: 'mobile-overflow',
            severity: 'medium',
            description: `Content is ${dimensions.documentWidth - dimensions.viewportWidth}px wider than the mobile viewport.`,
            evidence: dimensions,
          },
        ]
      : [];
  },
};
