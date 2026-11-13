import type { GetServerSideProps } from 'next';
import {
  destinationServerSideProps,
  type DestinationPagesProps,
} from '../../../destination-server';
import { PagesDestinationRoute } from '../../../components/PagesDestinationRoute';

// The route remainder is the Destination path: /pages/destination is `/`.
export const getServerSideProps: GetServerSideProps<DestinationPagesProps> = (context) =>
  destinationServerSideProps(context);

export default PagesDestinationRoute;
