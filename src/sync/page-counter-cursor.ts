const LEGACY_PAGE_SIZE = 20;

/**
 * When we go through pages one by one (counter-based pagination), the "pageNo" value makes sense only for a specific
 * page size. If the page size gets changed, the "pageNo" will point to some random position in history. This is a
 * problem when we need to go over thousands of pages and we need to store the state of the pagination somewhere
 * (e.g. database).
 *
 * This class represents a "smart" cursor, which is aware of page size that is being used for pagination
 * Therefore, when the page size changes, all in-flight cursors will automatically scale themselves and that would
 * avoid data loss.
 */
export class PageSizeAwareCounterCursor {

	/**
	 *
	 * @param pageNoOrSerialisedCursor - when a serialized cursor is provided it will scale it according to perPage value.
* 																	 		Otherwise (number) it will assume page size as 20 - the original behaviour.
	 * @param perPage - ignored is plain pageNo is provided, for migration of the cursors. "Plain number" means that
	 * 									the old sync is still in progress with pageNo size equals 20
	 */
	constructor(pageNoOrSerialisedCursor: string | number, perPage: number) {
		if (!pageNoOrSerialisedCursor || Number(pageNoOrSerialisedCursor)) {
			this.pageNo = Number(pageNoOrSerialisedCursor) || 1;
			// Page size we were using together with plain-number cursors.
			this.perPage = LEGACY_PAGE_SIZE;
		} else {
			const parsed = JSON.parse("" + pageNoOrSerialisedCursor) as PageSizeAwareCounterCursor;

			if (parsed.perPage === perPage) {
				this.perPage = parsed.perPage;
				this.pageNo = parsed.pageNo;
				return ;
			}

			const processedPages = (parsed.pageNo - 1) * parsed.perPage;

			const fullyProcessedScaledPages = Math.floor(processedPages / perPage);

			this.perPage = perPage;
			this.pageNo = fullyProcessedScaledPages + 1;
		}
	}
	perPage: number;
	pageNo: number; // starting from 1; the very first page has cursor with pageNo=1

	copyWithPageNo(pageNo: number): PageSizeAwareCounterCursor {
		const ret = new PageSizeAwareCounterCursor(1, 1);
		ret.pageNo = pageNo || 1;
		ret.perPage = this.perPage;
		return ret;
	}

	serialise() {
		return JSON.stringify({
			perPage: this.perPage,
			pageNo: this.pageNo
		});
	}
}
