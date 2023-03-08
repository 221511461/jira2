export const calcNewBackfillSinceDate = (
	existingBackfillSince: Date | undefined,
	commitsFromDate: Date | undefined,
	isInitialSync: boolean | undefined
): Date | undefined  => {

	//------------ initial new sync ---------------
	if (isInitialSync) {
		//for initial new sync, take whatever provided as the commitsFromDate
		//even it is undefined (which means everything will be synced)
		return commitsFromDate;
	}

	//------------ restart/continue existing backfill ---------------
	if (!existingBackfillSince) {
		//this is previously backfilled customers,
		//we assume all data area backfilled,
		//so keep the date empty for ALL_BACKFILLED
		return existingBackfillSince;
	}

	if (!commitsFromDate) {
		//backfill is instructed to backfill everything, so use it
		return commitsFromDate;
	}

	if (existingBackfillSince.getTime() <= commitsFromDate.getTime()) {
		//Origin backfill date is either empty or earlier,
		//So use the existing backfillSince date.
		return existingBackfillSince;
	}

	//The new backfill date is earlier then the origin one
	//Use the new backfill date
	return commitsFromDate;
};

