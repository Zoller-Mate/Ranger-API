import type { Request, Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import { db, camp } from '../../db';
import catchAsync from '../../utils/catchAsync';


export const mainPageView = (req: Request, res: Response, next: NextFunction) => {
  res.render('./mainPage.pug', {});
}

export const profileView = (req: Request, res: Response, next: NextFunction) => {
    res.render('./profile.pug');
}

export const campsView = (req: Request, res: Response, next: NextFunction) => {
  res.render('./camps.pug');
}

export const campView = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const id = req.params.id??'';
  const name = (await db.select({"name":camp.name}).from(camp).where(eq(camp.id, id)))[0]?.name??'';
  if(!name) res.redirect('/camps');
  else res.render('./camp.pug', {campName:name, campId: id});
});

export const joinedCampView = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const id = req.params.id ?? '';
  console.log(req.user);
  const name =
    (await db.select({ name: camp.name }).from(camp).where(eq(camp.id, id)))[0]
      ?.name ?? '';
  if (!name) res.redirect('/camps');
  else res.render('./joinedCamp.pug', { campName: name, campId: id, userRole: req.user?.campRole });
})

export const paymentView = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  res.render('./payments.pug');
};

export const passwordResetView = (req: Request, res: Response, next: NextFunction) => {
  res.render('./passwordResetPage.pug', {token: req.params.token});
};

export const condirmRegistrationView = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  res.render('./confirmEmail.pug', { token: req.params.token });
};

export const joinCampView = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  res.render('./joinCamp.pug', { code: req.params.code });
};

export const devDocsView = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  res.render('./devDocs.pug');
};

export const userDocsView = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  res.render('./userDocs.pug');
};