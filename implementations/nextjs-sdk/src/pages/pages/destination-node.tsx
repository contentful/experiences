import type { GetServerSideProps } from 'next';
import { destinationServerSideProps, type DestinationPagesProps } from '../../destination-server';
import { PagesDestinationRoute } from '../../components/PagesDestinationRoute';

// Selects the configured DESTINATION_NODE_ID instead of a path.
export const getServerSideProps: GetServerSideProps<DestinationPagesProps> = (context) =>
  destinationServerSideProps(context);

export default PagesDestinationRoute;
