import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import Shops from './pages/Shops'
import Feed from './pages/Feed'
import ShopDetail from './pages/ShopDetail'
import RegisterShop from './pages/RegisterShop'
import Profile from './pages/Profile'
import Dashboard from './pages/Dashboard'

const router=createBrowserRouter([{path:'/',element:<Layout/>,children:[{index:true,element:<Home/>},{path:'shops',element:<Shops/>},{path:'shops/:id',element:<ShopDetail/>},{path:'feed',element:<Feed/>},{path:'register-shop',element:<RegisterShop/>},{path:'profile',element:<Profile/>},{path:'dashboard',element:<Dashboard/>}]}])
export default function App(){return <RouterProvider router={router}/>}
