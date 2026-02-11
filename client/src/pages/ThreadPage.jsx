import { useParams } from 'react-router-dom';

function ThreadPage() {
  const { threadId } = useParams();
  return <h1>Thread #{threadId}</h1>;
}

export default ThreadPage;
